import 'dotenv/config';
import fs from 'fs';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

const appointmentSuggestionSchema = z.object({
    suggestedAppointments: z.array(z.object({
        // Core appointment fields (aligned with Pydantic class)
        start: z.string().describe("The start time of the appointment in ISO format (YYYY-MM-DDTHH:MM:SSZ)"),
        end: z.string().describe("The end time of the appointment in ISO format (YYYY-MM-DDTHH:MM:SSZ)"),
        serviceId: z.number().describe("The ID of the service"),
        locationId: z.number().describe("The ID of the location"),
        practitionerId: z.number().describe("The ID of the practitioner"),
        patientId: z.number().describe("The ID of the patient"),
        caseId: z.number().nullable().describe("The ID of the case associated with this appointment (null if not applicable)"),
        note: z.string().nullable().describe("Descriptive title of the appointment (null if not applicable)"),
        
        // Additional scheduling fields
        appointmentIndex: z.number().describe("Sequential number starting from 0"),
        service: z.string().describe("Name of the service being scheduled"),
        duration: z.string().describe("Human-readable duration string (e.g., '1 h 30 m')"),
        confidence: z.enum(['low', 'medium', 'high']).describe("Confidence level in this suggestion"),
        reasoning: z.string().describe("Explanation of why this time slot is optimal, including local time context")
    })),
    summary: z.object({
        totalAppointmentsSuggested: z.number(),
        schedulingConflicts: z.array(z.string()),
        recommendations: z.array(z.string())
    })
});

class AppointmentSuggestionEngine {
    constructor() {
        console.log('⚙️  Initializing Appointment Suggestion Engine with gpt-4o...');
        this.model = new ChatOpenAI({
            modelName: "gpt-4o",
            temperature: 0.3,
            openAIApiKey: process.env.OPENAI_API_KEY,
        });
        
        this.structuredModel = this.model.withStructuredOutput(appointmentSuggestionSchema);
        console.log('✅ Appointment Suggestion Engine ready');
    }


    async callLLM(appointment, caseDetails = null, availabilityData, schedulingInstructions = '') {
        // Parse availability data to extract timezone context
        const availability = typeof availabilityData === 'string' ? JSON.parse(availabilityData) : availabilityData;
        const practitionerTimezone = availability.practitionerTimezone || 'Australia/Melbourne';
        
        const prompt = `You are an expert appointment scheduling assistant. You will receive appointment details, case information, practitioner availability data and scheduling instructions.

APPOINTMENT TO SCHEDULE:
${JSON.stringify(appointment, null, 2)}

${caseDetails ? `CASE DETAILS:
${JSON.stringify(caseDetails, null, 2)}

` : ''}PRACTITIONER AVAILABILITY DATA:
${availabilityData}

${schedulingInstructions ? `SCHEDULING INSTRUCTIONS:
${schedulingInstructions}

` : ''}

IMPORTANT TIMEZONE CONTEXT:
- Practitioner Timezone: ${practitionerTimezone}
- All availability slots include both UTC times and local times for context
- When analyzing "morning", "afternoon", "evening" preferences, use the LOCAL time context
- Business hours are based on the practitioner's LOCAL timezone, not UTC

SCHEDULING RULES (TIMEZONE-AWARE):
Please analyze the availability and instructions to suggest optimal appointment times. Unless otherwise specified in the instructions, provide 5 different time slot suggestions for each requested appointment. Consider:

1. **Available Time Slots**: Use the practitioner's free time slots, prioritizing those with good local time context
2. **Local Time Preferences**: When instructions mention "morning appointments", use the LOCAL time context (e.g., 9 AM local, not 9 AM UTC)
3. **Business Hours Compliance**: Respect normal business hours in the practitioner's local timezone (typically 8 AM - 6 PM local time)
4. **Duration and Travel Time**: Account for appointment duration plus travel time requirements
5. **Participant Preferences**: Respect participant's suitable days and times, interpreting these in local context
6. **Service Type Timing (LOCAL TIME RULES)**:
   - **Non-reporting sessions**: Schedule Monday mornings through Thursday lunchtime (LOCAL TIME)
   - **Reporting sessions**: Schedule Thursday afternoons through Friday afternoons (LOCAL TIME)
7. **Consistency Patterns**: When possible, maintain consistent day/time patterns using LOCAL time references
8. **Conflict Minimization**: Optimize scheduling to minimize travel time and maximize efficiency

For each appointment suggestion, provide:
- start: Start time in ISO format (YYYY-MM-DDTHH:MM:SSZ)
- end: End time in ISO format (YYYY-MM-DDTHH:MM:SSZ)
- serviceId: ID of the service (extract or infer from instructions)
- locationId: ID of the location (extract or infer from instructions)
- practitionerId: ID of the practitioner (extract or infer from instructions)
- patientId: ID of the patient (extract or infer from instructions)
- caseId: ID of the case if available (optional)
- note: Descriptive title of the appointment (optional)
- appointmentIndex: Sequential number starting from 0
- service: Name of the service being scheduled
- duration: Human-readable duration string (e.g., "1 h 30 m")
- confidence: Your confidence level (low/medium/high) in this suggestion
- reasoning: Explanation of why this time slot is optimal, including local time context

Also provide a summary with:
- totalAppointmentsSuggested: Number of appointment suggestions you provided
- schedulingConflicts: Array of any conflicts or issues found
- recommendations: General scheduling advice`;

        console.log('🧠 Generating appointment suggestions with gpt-4o...');
        console.log(`📊 Processing appointment: ${appointment.service} (${appointment.duration}min + ${appointment.travelTime}min travel)`);
        console.log(`📅 Date range: ${appointment.dateRangeStart} to ${appointment.dateRangeEnd}`);
        console.log(`📝 Prompt length: ${prompt.length} characters`);
        
        const startTime = Date.now();
        
        try {
            const messages = [new HumanMessage(prompt)];
            const response = await this.structuredModel.invoke(messages);
            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            
            console.log(`✅ Suggestions generated in ${duration}s`);
            console.log(`💡 Created ${response.suggestedAppointments.length} appointment suggestions`);
            console.log(`⚠️  ${response.summary.schedulingConflicts.length} conflicts identified`);
            
            return response;
        } catch (error) {
            console.error('❌ Appointment suggestion generation failed:', error.message);
            throw error;
        }
    }

    /**
     * Suggest optimal appointment times based on appointment details and availability
     * @param {Object} appointment - Details of the appointment to schedule
     * @param {Object|null} caseDetails - Optional case details for additional context
     * @param {string} availabilityData - Practitioner availability data
     * @param {string} schedulingInstructions - Optional additional scheduling instructions
     * @returns {Object} Structured appointment suggestions with reasoning
     */
    async suggestAppointments(appointment, caseDetails = null, availabilityData, schedulingInstructions = '') {
        console.log('🔄 Starting appointment suggestion process...');
        console.log(`📋 Processing: ${appointment.service} appointment`);
        
        const suggestions = await this.callLLM(appointment, caseDetails, availabilityData, schedulingInstructions);
        
        return {
            ...suggestions,
            timestamp: new Date().toISOString()
        };
    }
}

export { AppointmentSuggestionEngine };