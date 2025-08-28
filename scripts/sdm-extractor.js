import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

const appointmentSchema = z.object({
    dateRangeStart: z.string().describe("Start date of the appointment range in ISO date format (e.g., '2025-08-24')"),
    dateRangeEnd: z.string().describe("End date of the appointment range in ISO date format (e.g., '2025-08-24')"),
    service: z.string().describe("Name of the service"),
    duration: z.number().describe("Duration of appointment excluding travel in minutes (e.g., 90 for '1 h 30 m')"),
    travelTime: z.number().describe("Travel time for the appointment in minutes (e.g., 40 for '40 m')"),
    totalTime: z.number().describe("Total time including travel in minutes (e.g., 130 for '2 h 10 m')"),
    cost: z.number().describe("Individual cost for this appointment as a number (e.g., 660.14 for '$660.14')"),
    cumulativeCost: z.number().describe("Cumulative cost as a number (e.g., 951.38 for '$951.38')"),
    isReportingSession: z.boolean().describe("Whether this appointment is a reporting/documentation session (true for Report components, false for direct service sessions)")
});

const sdmStructuredSchema = z.object({
    participant: z.object({
        participantName: z.string().describe("Name of the participant"),
        state: z.string().describe("State where participant is located"),
        serviceRequired: z.string().describe("Type of service required"),
        suitableDays: z.string().describe("Participant preferences for suitable days of the week"),
        suitableTime: z.string().describe("Participant preferences for suitable time of day")
    }),
    planDetails: z.object({
        planStartDate: z.string().describe("Plan start date in ISO date format (e.g., '2023-06-30')"),
        planEndDate: z.string().describe("Plan end date in ISO date format (e.g., '2026-06-30')"),
        totalPlanBudget: z.number().describe("Total plan budget amount as a number (e.g., 4013.82 for '$4,013.82')"),
        totalPlanBudgetHours: z.number().describe("Total plan budget in indicative hours as a number (e.g., 17.2)")
    }),
    servicePlanning: z.object({
        intakeDate: z.string().describe("Intake date in ISO date format (e.g., '2025-08-07')"),
        serviceCommencement: z.string().describe("Service commencement date in ISO date format (e.g., '2025-08-24')"),
        travelRequired: z.string().describe("Whether travel is required (Yes/No)"),
        lastParticipantOfDay: z.string().describe("Whether participant is last of day (Yes/No)"),
        serviceFrequency: z.string().describe("Frequency of service delivery")
    }),
    appointments: z.array(appointmentSchema).describe("List of appointments to be planned")
});

async function convertSDMToStructured(inputData) {
    console.log('🔄 Starting SDM extraction process...');
    
    try {
        console.log('📝 Building extraction prompt...');
        const prompt = `Extract and structure data from this SDM planning tool data.

Input Data:
${inputData}

Please extract the following information:

1. Participant Information:
   - Participant name
   - State
   - Service required 
   - Preferences for suitable days of the week
   - Preferences for suitable time of day

2. Plan Details:
   - Plan start date in ISO format (YYYY-MM-DD)
   - Plan end date in ISO format (YYYY-MM-DD)
   - Total plan budget as a number (remove $ and commas, e.g., "$4,013.82" becomes 4013.82)
   - Total plan budget in indicative hours as a number (e.g., "17.2 hours" becomes 17.2)

3. Service Planning:
   - Intake date in ISO format (YYYY-MM-DD)
   - Service commencement date in ISO format (YYYY-MM-DD)
   - Travel required (Yes/No)
   - Last participant of the day status (Yes/No)
   - Service frequency

4. Appointments List:
   Extract data from the "Appointments to plan:" list into an array following these rules:
   - Each appointment should have: Date range start, Date range end, Service, Duration, Travel time, Total time, Cost, Cumulative cost, Is reporting session
   - Date range start: the start date of the range in which this appointment should be scheduled, in ISO format (YYYY-MM-DD)
   - Date range end: the end date of the range in which this appointment should be scheduled, in ISO format (YYYY-MM-DD)
   - Service: the name of the service for this appointment as listed in the "SERVICE" column
   - Duration: the length of the appointment in minutes, excluding travel time, converted from the "TIME" column (e.g., "1 h 30 m" becomes 90)
   - Travel time: the allocated travel time for the appointment's service type in minutes, converted from the "SERVICE DETAIL" section (e.g., "40 m" becomes 40)
   - Total time: the total time needed in the calendar for this appointment in minutes, i.e. duration + travel time
   - Cost: the individual cost for this appointment as a number, removing $ and commas from the "COST" column (e.g., "$660.14" becomes 660.14)
   - Cumulative cost: the cumulative cost for this appointment as a number, removing $ and commas from the "TOTAL" column (e.g., "$951.38" becomes 951.38)
   - Is reporting session: true if this appointment is for report writing/documentation (Report components), false for direct service sessions
   - IGNORE appointments that have a cumulative cost in the "TOTAL" column that exceeds the "Total Plan Budget ($)"
   - IGNORE appointments that have a service type of "Clinical Intake" - This appointment should have already been scheduled and booked
   - Check each appointment service in the "SERVICE DETAIL" section (i.e match the service in the "SERVICE" column to the service header in the "SERVICE DETAIL" section).
     - For any appointment with a service type that includes a "Report" component, that component should be listed as a separate appointment in the final output, with the same date range as the original appointment, and with no associated travel or cost. The original appointment duration should be reduced by the time allocated for the report.
     - For each appointment, provider travel time should be extracted from the "SERVICE DETAIL" section for the associated service type, as described above

Convert all dates to ISO format (YYYY-MM-DD). For example:
- "24 Aug 2025" becomes "2025-08-24"
- "30 Jun 2023" becomes "2023-06-30"
- "Thursday, 07 Aug 2025" becomes "2025-08-07"`;

        const modelConfig = {
            modelName: "o3",
            temperature: 1
        };

        console.log('⚙️  Configuring o3 model...');
        console.log(`📊 Extraction prompt length: ${prompt.length} characters`);
        
        const model = new ChatOpenAI({
            ...modelConfig,
            openAIApiKey: process.env.OPENAI_API_KEY,
        });
        
        const structuredModel = model.withStructuredOutput(sdmStructuredSchema);
        
        console.log('🧠 Calling o3 model for SDM extraction...');
        const startTime = Date.now();
        let response;
        
        try {
            const messages = [new HumanMessage(prompt)];
            
            console.log('🤖 Processing with o3...');
            response = await structuredModel.invoke(messages);
            
        } catch (error) {
            console.error('❌ SDM extraction failed:', error.message);
            console.error('🔍 Error details:', error);
            throw error;
        }
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log(`✅ SDM extraction completed in ${duration}s`);
        console.log(`📋 Extracted ${response.appointments.length} appointments for ${response.participant.participantName}`);
        
        return response;
        
    } catch (error) {
        console.error('❌ Fatal error in SDM extraction:', error.message);
        throw error;
    }
}


export { convertSDMToStructured };