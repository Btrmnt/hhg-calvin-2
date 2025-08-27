import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

const appointmentSelectionSchema = z.object({
    natural_response: z.string().describe("Human-readable explanation of the appointment selections made, including reasoning for each choice and any issues encountered"),
    structured_response: z.object({
        practitionerId: z.number().describe("ID of the practitioner for these appointments"),
        caseId: z.number().nullable().describe("Case ID for the participant"),
        caseName: z.string().nullable().describe("Name or identifier for the case"),
        clientId: z.number().nullable().describe("Client/participant ID"),
        appointments: z.array(z.object({
            start: z.string().describe("Selected appointment start time in ISO format"),
            end: z.string().describe("Selected appointment end time in ISO format"),
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
        this.model = new ChatOpenAI({
            model: 'o3',
            maxTokens: 8000
        });
    }

    /**
     * Select optimal appointments from suggestion engine results based on scheduling rules
     * @param {Object} sdmData - Extracted participant and appointment data from SDM
     * @param {Array} suggestionResults - Array of suggestion engine results for each appointment
     * @param {Array} conflictResults - Array of conflict checker results for each suggestion set
     * @returns {Object} Structured appointment selections with reasoning
     */
    async selectAppointments(sdmData, suggestionResults, conflictResults) {
        // Validate inputs
        if (!sdmData || !sdmData.appointments || !Array.isArray(sdmData.appointments)) {
            throw new Error('Invalid SDM data structure - missing appointments array');
        }

        if (!Array.isArray(suggestionResults) || suggestionResults.length !== sdmData.appointments.length) {
            throw new Error('Suggestion results array must match the number of appointments in SDM data');
        }

        if (!Array.isArray(conflictResults) || conflictResults.length !== sdmData.appointments.length) {
            throw new Error('Conflict results array must match the number of appointments in SDM data');
        }

        // Build comprehensive prompt with all data and rules
        const prompt = this.buildSelectionPrompt(sdmData, suggestionResults, conflictResults);

        try {
            // Get structured response from LLM
            const structuredLlm = this.model.withStructuredOutput(appointmentSelectionSchema);
            const result = await structuredLlm.invoke([
                {
                    role: "system",
                    content: "You are an expert healthcare appointment scheduler. Your job is to select the optimal appointments from suggested options while following all scheduling rules and participant preferences."
                },
                {
                    role: "user", 
                    content: prompt
                }
            ]);

            return result;

        } catch (error) {
            console.error('Error in appointment selection:', error);
            throw new Error(`Failed to select appointments: ${error.message}`);
        }
    }

    /**
     * Build comprehensive prompt with all data and scheduling rules
     * @param {Object} sdmData - SDM extraction data
     * @param {Array} suggestionResults - Suggestion engine results
     * @param {Array} conflictResults - Conflict checker results
     * @returns {string} Formatted prompt for LLM
     */
    buildSelectionPrompt(sdmData, suggestionResults, conflictResults) {
        const { participant, planDetails, servicePlanning, appointments } = sdmData;

        let prompt = `# APPOINTMENT SELECTION TASK

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

## SCHEDULING RULES (PRIORITY ORDER)
1. **CONFLICTS**: Never select appointments marked as conflicted in the conflict checker results
2. **PARTICIPANT PREFERENCES**: Respect participant's suitable days and times wherever possible
3. **SESSION TYPE TIMING**: 
   - Non-reporting sessions: Monday mornings through Thursday lunch times (preferred)
   - Reporting sessions: Thursday afternoons through Friday afternoons (preferred)
4. **REGULAR CADENCE**: Maintain consistent scheduling patterns for similar session types
5. **CONSISTENCY**: Schedule same appointment types on same day of week and time of day when possible
6. **ALERT ISSUES**: If no suitable appointment can be found, provide detailed explanation

## APPOINTMENTS TO SCHEDULE

`;

        // Add each appointment with its suggestions and conflict status
        appointments.forEach((appointment, index) => {
            const suggestions = suggestionResults[index];
            const conflicts = conflictResults[index];

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
                    const dayOfWeek = startDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
                    const timeOfDay = this.getTimeOfDay(startDate);
                    
                    // Check if this suggestion has conflicts
                    const hasConflict = conflicts.conflictedAppointments && 
                        conflicts.conflictedAppointments.some(conflicted => 
                            conflicted.start === suggestion.start && conflicted.end === suggestion.end
                        );

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

            // Add conflict summary
            if (conflicts.summary) {
                prompt += `
**Conflict Summary**: ${conflicts.summary.totalValid} valid, ${conflicts.summary.totalConflicted} conflicted
`;
            }

            prompt += `
`;
        });

        prompt += `
## SELECTION INSTRUCTIONS

For each appointment above, select the BEST suggestion that:
1. Has NO conflicts (✅ status only)
2. Best matches participant preferences and scheduling rules
3. Maintains consistency with other selected appointments where possible
4. Follows session type timing preferences (reporting vs non-reporting)

If no suitable option exists for any appointment, include it in the "issues" array with a detailed explanation and recommendation.

Provide both a natural language explanation and structured data for your selections.
`;

        return prompt;
    }

    /**
     * Determine time of day category from a date
     * @param {Date} date - Date object
     * @returns {string} Time category
     */
    getTimeOfDay(date) {
        const hour = date.getUTCHours();
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        return 'evening';
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