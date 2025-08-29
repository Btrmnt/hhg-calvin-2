import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { 
    getTimeOfDayRange,
    convertLocalToUTC,
    convertAvailabilityToLocalTime
} from './utils/timezone-utils.js';

const appointmentSelectionSchema = z.object({
    natural_response: z.string().describe("Human-readable explanation of the appointment selections made, including reasoning for each choice and any issues encountered"),
    structured_response: z.object({
        practitionerId: z.number().describe("ID of the practitioner for these appointments"),
        caseId: z.number().nullable().describe("Case ID for the participant"),
        caseName: z.string().nullable().describe("Name or identifier for the case"),
        clientId: z.number().nullable().describe("Client/participant ID"),
        appointments: z.array(z.object({
            start: z.string().describe("Selected appointment start time in LOCAL time ISO format (YYYY-MM-DDTHH:MM:SS)"),
            end: z.string().describe("Selected appointment end time in LOCAL time ISO format (YYYY-MM-DDTHH:MM:SS)"),
            serviceId: z.number().describe("Service ID for this appointment"),
            locationId: z.number().describe("Location ID for this appointment"),
            practitionerId: z.number().describe("Practitioner ID"),
            patientId: z.number().describe("Patient/participant ID"),
            caseId: z.number().nullable().describe("Case ID"),
            note: z.string().describe("Note describing the appointment selection"),
            originalAppointmentIndex: z.number().describe("Index of the original appointment from SDM data"),
            selectedSuggestionIndex: z.number().describe("Index of the selected suggestion from the suggestion engine results"),
            service: z.string().describe("Service type name"),
            isReportingSession: z.boolean().describe("Whether this is a reporting session"),
            dayOfWeek: z.string().describe("Day of week for this appointment (e.g., 'Monday', 'Tuesday')"),
            timeOfDay: z.string().describe("Time of day category (e.g., 'morning', 'afternoon', 'evening')")
        })).describe("Array of selected appointments"),
        schedulePlanSummary: z.string().describe("Summary of the overall scheduling plan and any patterns maintained"),
        issues: z.array(z.object({
            appointmentIndex: z.number().describe("Index of the problematic appointment"),
            service: z.string().describe("Service type that had issues"),
            issue: z.string().describe("Description of the scheduling issue"),
            recommendation: z.string().describe("Recommended action to resolve the issue")
        })).describe("Any scheduling issues or conflicts that could not be resolved")
    }).describe("Structured data for the appointment selections"),
    status: z.enum(["success", "partial_success", "failure"]).describe("Overall status of the appointment selection process")
});

class AppointmentSelector {
    constructor() {
        console.log('⚙️  Initializing Appointment Selector with o3...');
        this.model = new ChatOpenAI({
            model: 'o3',
            maxTokens: 8000
        });
        console.log('✅ Appointment Selector ready');
    }


    /**
     * Convert suggestion results from UTC to local time for LLM consumption
     * @param {Array} suggestionResults - Array of suggestion results with UTC timestamps
     * @param {string} practitionerTimezone - Practitioner's timezone
     * @returns {Array} Suggestion results with local time timestamps
     */
    convertSuggestionsToLocalTime(suggestionResults, practitionerTimezone) {
        return suggestionResults.map(suggestions => ({
            ...suggestions,
            suggestedAppointments: suggestions.suggestedAppointments ? suggestions.suggestedAppointments.map(appointment => ({
                ...appointment,
                start: new Date(appointment.start).toLocaleString('sv-SE', { timeZone: practitionerTimezone }),
                end: new Date(appointment.end).toLocaleString('sv-SE', { timeZone: practitionerTimezone })
            })) : []
        }));
    }

    /**
     * Convert LLM selection output from local time back to UTC
     * @param {Object} selectionResult - LLM selection with local timestamps
     * @param {string} practitionerTimezone - Practitioner's timezone
     * @returns {Object} Selection result with UTC timestamps
     */
    convertSelectionsToUTC(selectionResult, practitionerTimezone) {
        return {
            ...selectionResult,
            structured_response: {
                ...selectionResult.structured_response,
                appointments: selectionResult.structured_response.appointments.map(appointment => ({
                    ...appointment,
                    start: convertLocalToUTC(appointment.start, practitionerTimezone),
                    end: convertLocalToUTC(appointment.end, practitionerTimezone)
                }))
            }
        };
    }


    /**
     * Select optimal appointments from suggestion engine results based on scheduling rules
     * @param {Object} sdmData - Extracted participant and appointment data from SDM
     * @param {Array} suggestionResults - Array of enhanced suggestion results with conflict status
     * @param {Object} availabilityData - Practitioner availability data with timezone context
     * @param {string} schedulingInstructions - Additional scheduling instructions and context for the LLM
     * @returns {Object} Structured appointment selections with reasoning
     */
    async selectAppointments(sdmData, suggestionResults, availabilityData, schedulingInstructions = '') {
        // Validate inputs
        if (!sdmData || !sdmData.appointments || !Array.isArray(sdmData.appointments)) {
            throw new Error('Invalid SDM data structure - missing appointments array');
        }

        if (!Array.isArray(suggestionResults) || suggestionResults.length !== sdmData.appointments.length) {
            throw new Error('Suggestion results array must match the number of appointments in SDM data');
        }

        console.log('🔄 Starting AI appointment selection process...');
        console.log(`👤 Participant: ${sdmData.participant.participantName}`);
        console.log(`📊 Analyzing ${sdmData.appointments.length} appointments with scheduling constraints`);
        
        // Convert data to local time for LLM consumption
        const practitionerTimezone = availabilityData.practitionerTimezone;
        const localAvailabilityData = convertAvailabilityToLocalTime(availabilityData);
        const localSuggestionResults = this.convertSuggestionsToLocalTime(suggestionResults, practitionerTimezone);
        
        // Build comprehensive prompt with all data and rules
        const prompt = this.buildSelectionPrompt(sdmData, localSuggestionResults, localAvailabilityData, schedulingInstructions);
        console.log(`📝 Selection prompt length: ${prompt.length} characters`);

        try {
            // Get structured response from LLM
            console.log('🧠 Calling o3 for intelligent appointment selection...');
            
            const startTime = Date.now();
            const structuredLlm = this.model.withStructuredOutput(appointmentSelectionSchema);
            const localResult = await structuredLlm.invoke([
                {
                    role: "system",
                    content: "You are an expert healthcare appointment scheduler. Your job is to select the optimal appointments from suggested options while following all scheduling rules and participant preferences. Work exclusively in the practitioner's local timezone."
                },
                {
                    role: "user", 
                    content: prompt
                }
            ]);
            
            // Convert LLM's local time selections back to UTC
            const utcResult = this.convertSelectionsToUTC(localResult, practitionerTimezone);
            
            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            
            console.log(`✅ Appointment selection completed in ${duration}s`);
            console.log(`📋 Status: ${utcResult.status}`);
            console.log(`🎯 Selected ${utcResult.structured_response.appointments.length} appointments`);
            console.log(`⚠️  Identified ${utcResult.structured_response.issues.length} scheduling issues`);

            return utcResult;

        } catch (error) {
            console.error('❌ Appointment selection failed:', error.message);
            throw new Error(`Failed to select appointments: ${error.message}`);
        }
    }

    /**
     * Build comprehensive prompt with all data and scheduling rules
     * @param {Object} sdmData - SDM extraction data
     * @param {Array} suggestionResults - Suggestion engine results
     * @param {Array} conflictResults - Conflict checker results
     * @param {Object} availabilityData - Practitioner availability data with timezone context
     * @param {string} schedulingInstructions - Additional scheduling instructions
     * @returns {string} Formatted prompt for LLM
     */
    buildSelectionPrompt(sdmData, suggestionResults, availabilityData, schedulingInstructions = '') {
        const { participant, planDetails, servicePlanning, appointments } = sdmData;

        // Extract timezone context from availability data
        const practitionerTimezone = availabilityData.practitionerTimezone || 'Australia/Melbourne';
        const practitionerId = availabilityData.practitionerId;

        let prompt = `# APPOINTMENT SELECTION TASK

## TIMEZONE CONTEXT
- **Practitioner ID**: ${practitionerId}
- **Practitioner Timezone**: ${practitionerTimezone}
- **Important**: All time-based decisions should consider the practitioner's LOCAL timezone

## PARTICIPANT INFORMATION
- **Name**: ${participant.participantName}
- **State**: ${participant.state}
- **Service Required**: ${participant.serviceRequired}
- **Suitable Days**: ${participant.suitableDays || 'Not specified'}
- **Suitable Time**: ${participant.suitableTime || 'Not specified'}

## PLAN DETAILS
- **Plan Period**: ${planDetails.planStartDate} to ${planDetails.planEndDate}
- **Total Budget**: $${planDetails.totalPlanBudget}
- **Total Hours**: ${planDetails.totalPlanBudgetHours}

## SERVICE PLANNING CONTEXT
- **Intake Date**: ${servicePlanning.intakeDate}
- **Service Commencement**: ${servicePlanning.serviceCommencement}
- **Travel Required**: ${servicePlanning.travelRequired}
- **Last Participant of Day**: ${servicePlanning.lastParticipantOfDay}
- **Service Frequency**: ${servicePlanning.serviceFrequency}

${schedulingInstructions ? `## ADDITIONAL SCHEDULING INSTRUCTIONS

${schedulingInstructions}

` : ''}## SCHEDULING RULES (PRIORITY ORDER - TIMEZONE AWARE)
1. **CONFLICTS**: Never select appointments marked as conflicted in the conflict checker results
2. **PARTICIPANT PREFERENCES**: Respect participant's suitable days and times wherever possible (interpret time preferences in LOCAL timezone)
   - **Note**: For reporting sessions, participants are not involved, so their preferences should be ignored
3. **SESSION TYPE TIMING (LOCAL TIME)**:
   - Non-reporting sessions: Monday mornings through Thursday lunch times (LOCAL TIME - ${practitionerTimezone})
   - Reporting sessions: Thursday afternoons through Friday afternoons (LOCAL TIME - ${practitionerTimezone})
4. **AVAILABLE SLOTS ONLY**: Schedule appointments only within the practitioner's available time slots - do not assume any general business hours restrictions
5. **REGULAR CADENCE**: Maintain consistent scheduling patterns for similar session types using local time patterns
6. **CONSISTENCY**: Schedule same appointment types on same day of week and time of day when possible (based on LOCAL time)
7. **LOCAL TIME AWARENESS**: When analyzing suggestions, prioritize options that make sense in the practitioner's local timezone context
8. **ALERT ISSUES**: If no suitable appointment can be found, provide detailed explanation including timezone considerations

## APPOINTMENTS TO SCHEDULE

`;

        // Add each appointment with its suggestions (now with conflict status included)
        appointments.forEach((appointment, index) => {
            const suggestions = suggestionResults[index];

            prompt += `### Appointment ${index + 1}: ${appointment.service}
- **Date Range**: ${appointment.dateRangeStart} to ${appointment.dateRangeEnd}
- **Duration**: ${appointment.duration} minutes (+ ${appointment.travelTime} minutes travel)
- **Cost**: $${appointment.cost}
- **Is Reporting Session**: ${appointment.isReportingSession}

**Available Suggestions**:
`;

            if (suggestions.suggestedAppointments && suggestions.suggestedAppointments.length > 0) {
                suggestions.suggestedAppointments.forEach((suggestion, suggestionIndex) => {
                    const startDate = new Date(suggestion.start);
                    const endDate = new Date(suggestion.end);
                    const dayOfWeek = startDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: practitionerTimezone });
                    const timeOfDay = getTimeOfDayRange(startDate, endDate, practitionerTimezone);
                    
                    // Use conflict status directly from enhanced suggestion
                    const hasConflict = suggestion.hasConflict;

                    prompt += `  ${suggestionIndex + 1}. ${suggestion.start} to ${suggestion.end} (${dayOfWeek} ${timeOfDay})
     - Confidence: ${suggestion.confidence}
     - Location: ${suggestion.locationId}
     - Conflicts: ${hasConflict ? '❌ HAS CONFLICTS' : '✅ No conflicts'}
     - Reasoning: ${suggestion.reasoning}
`;
                });
            } else {
                prompt += `  No valid suggestions available for this appointment.
`;
            }

            // Add conflict summary from enhanced suggestions
            if (suggestions.summary) {
                prompt += `
**Conflict Summary**: ${suggestions.summary.totalValid} valid, ${suggestions.summary.totalConflicted} conflicted
`;
            }

            prompt += `
`;
        });

        prompt += `
## SELECTION INSTRUCTIONS (LOCAL TIME ONLY)

IMPORTANT: Work exclusively in ${practitionerTimezone} local time. All times in the data above are local times.

For each appointment above, select the BEST suggestion that:
1. Has NO conflicts (✅ status only)
2. Best matches participant preferences and scheduling rules  
3. Maintains consistency with other selected appointments where possible
4. Follows session type timing preferences:
   - Non-reporting sessions: Monday mornings through Thursday lunch times
   - Reporting sessions: Thursday afternoons through Friday afternoons
5. Makes logical sense from a local time perspective (9 AM means 9 AM local time)

When providing selected appointment times, use LOCAL time in ISO format (YYYY-MM-DDTHH:MM:SS).

If no suitable option exists for any appointment, include it in the "issues" array with a detailed explanation and recommendation.

Provide both a natural language explanation and structured data for your selections, working entirely in local time context.
`;

        return prompt;
    }


    /**
     * Generate a summary report of the selection process
     * @param {Object} selectionResult - Result from selectAppointments
     * @returns {string} Human-readable report
     */
    generateSelectionReport(selectionResult) {
        const { natural_response, structured_response, status } = selectionResult;
        
        let report = `=== APPOINTMENT SELECTION REPORT ===\n\n`;
        
        report += `STATUS: ${status.toUpperCase()}\n\n`;
        
        report += `OVERVIEW:\n${natural_response}\n\n`;
        
        if (structured_response.appointments.length > 0) {
            report += `SELECTED APPOINTMENTS:\n`;
            structured_response.appointments.forEach((apt, index) => {
                report += `${index + 1}. ${apt.service}\n`;
                report += `   📅 Time: ${apt.start} to ${apt.end}\n`;
                report += `   📍 Day: ${apt.dayOfWeek} ${apt.timeOfDay}\n`;
                report += `   🏥 Location: ${apt.locationId}\n`;
                report += `   📋 Type: ${apt.isReportingSession ? 'Reporting Session' : 'Non-Reporting Session'}\n`;
                report += `   📝 Note: ${apt.note}\n\n`;
            });
        }
        
        if (structured_response.issues.length > 0) {
            report += `SCHEDULING ISSUES:\n`;
            structured_response.issues.forEach((issue, index) => {
                report += `${index + 1}. ${issue.service} (Appointment #${issue.appointmentIndex + 1})\n`;
                report += `   ❌ Issue: ${issue.issue}\n`;
                report += `   💡 Recommendation: ${issue.recommendation}\n\n`;
            });
        }
        
        report += `PLAN SUMMARY:\n${structured_response.schedulePlanSummary}\n`;
        
        return report;
    }
}

export { AppointmentSelector };