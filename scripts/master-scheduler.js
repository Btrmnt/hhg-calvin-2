import 'dotenv/config';
import fs from 'fs';
import { convertSDMToStructured } from './sdm-extractor.js';
import { PractitionerAvailabilityCalculator } from './practitioner-availability.js';
import { AppointmentSuggestionEngine } from './appointment-suggestion-engine.js';
import { ConflictChecker } from './conflict-checker.js';
import { AppointmentSelector } from './appointment-selector.js';

class MasterScheduler {
    constructor() {
        this.availabilityCalculator = new PractitionerAvailabilityCalculator();
        this.suggestionEngine = new AppointmentSuggestionEngine();
        this.conflictChecker = new ConflictChecker();
        this.appointmentSelector = new AppointmentSelector();
    }

    /**
     * Complete end-to-end scheduling process
     * @param {string} sdmInput - Raw SDM data string
     * @param {string} schedulingInstructions - Additional scheduling instructions
     * @param {number} practitionerId - ID of the practitioner to schedule with
     * @param {string} startDate - Start date for availability calculation (YYYY-MM-DD)
     * @param {string} endDate - End date for availability calculation (YYYY-MM-DD)
     * @returns {Object} Complete scheduling results
     */
    async scheduleAppointments(sdmInput, schedulingInstructions = '', practitionerId = 46932, startDate = '2025-08-01', endDate = '2025-08-31') {
        console.log('🚀 Starting Master Scheduler...\n');
        
        try {
            // Step 1: Extract structured data from SDM
            console.log('📋 Step 1: Extracting structured data from SDM...');
            const sdmData = await convertSDMToStructured(sdmInput);
            console.log(`   ✅ Extracted ${sdmData.appointments.length} appointments for ${sdmData.participant.participantName}`);
            console.log(`   📅 Plan period: ${sdmData.planDetails.planStartDate} to ${sdmData.planDetails.planEndDate}`);
            console.log();

            // Step 2: Get practitioner availability
            console.log('📅 Step 2: Calculating practitioner availability...');
            const availabilityData = await this.availabilityCalculator.calculateAvailability(
                practitionerId, 
                startDate, 
                endDate
            );
            const availability = JSON.parse(availabilityData);
            console.log(`   ✅ Found ${availability.summary.totalFreeSlots} free slots`);
            console.log(`   ⏰ Total available time: ${availability.summary.totalFreeMinutes} minutes`);
            console.log();

            // Step 3: Process appointments in parallel
            console.log('🤖 Step 3: Processing appointments through suggestion engine and conflict checker...');
            
            const appointmentPromises = sdmData.appointments.map(async (appointment, index) => {
                console.log(`   📝 Processing appointment ${index + 1}: ${appointment.service}`);
                
                // Prepare case details (everything except appointments)
                const caseDetails = {
                    participant: sdmData.participant,
                    planDetails: sdmData.planDetails,
                    servicePlanning: sdmData.servicePlanning
                };

                // Get suggestions from AI
                const suggestions = await this.suggestionEngine.suggestAppointments(
                    appointment,
                    caseDetails,
                    availabilityData,
                    schedulingInstructions
                );

                // Check for conflicts
                const conflicts = this.conflictChecker.checkConflicts(availability, suggestions);

                console.log(`      ✅ ${conflicts.summary.totalValid} valid suggestions, ${conflicts.summary.totalConflicted} conflicted`);

                return {
                    appointment,
                    suggestions,
                    conflicts,
                    index
                };
            });

            const appointmentResults = await Promise.all(appointmentPromises);
            console.log(`   ✅ Processed all ${appointmentResults.length} appointments\n`);

            // Step 4: Select optimal appointments
            console.log('🎯 Step 4: Selecting optimal appointments with AI selector...');
            
            const suggestionResults = appointmentResults.map(result => result.suggestions);
            const conflictResults = appointmentResults.map(result => result.conflicts);
            
            const selectionResult = await this.appointmentSelector.selectAppointments(
                sdmData,
                suggestionResults,
                conflictResults,
                schedulingInstructions
            );

            console.log(`   ✅ Selection completed with status: ${selectionResult.status}`);
            console.log(`   📋 Selected ${selectionResult.structured_response.appointments.length} appointments`);
            console.log(`   ⚠️  ${selectionResult.structured_response.issues.length} issues identified\n`);

            // Step 5: Generate comprehensive results
            const results = {
                summary: {
                    participant: sdmData.participant.participantName,
                    totalAppointmentsRequired: sdmData.appointments.length,
                    totalAppointmentsSelected: selectionResult.structured_response.appointments.length,
                    totalIssues: selectionResult.structured_response.issues.length,
                    status: selectionResult.status,
                    processingTimestamp: new Date().toISOString()
                },
                sdmData,
                availability: {
                    practitionerId,
                    dateRange: { startDate, endDate },
                    totalFreeSlots: availability.summary.totalFreeSlots,
                    totalFreeMinutes: availability.summary.totalFreeMinutes
                },
                appointmentResults,
                selection: selectionResult,
                humanReadableReport: this.generateHumanReadableReport(selectionResult, sdmData)
            };

            console.log('✅ Master Scheduler completed successfully!\n');
            return results;

        } catch (error) {
            console.error('❌ Error in Master Scheduler:', error.message);
            throw error;
        }
    }

    /**
     * Generate human-readable report with AEST timezone conversion
     * @param {Object} selectionResult - Results from appointment selector
     * @param {Object} sdmData - Original SDM data
     * @returns {string} Formatted report
     */
    generateHumanReadableReport(selectionResult, sdmData) {
        const { natural_response, structured_response, status } = selectionResult;
        
        let report = `# 📅 APPOINTMENT SCHEDULING REPORT\n\n`;
        
        // Header information
        report += `**Participant:** ${sdmData.participant.participantName}\n`;
        report += `**Service:** ${sdmData.participant.serviceRequired}\n`;
        report += `**State:** ${sdmData.participant.state}\n`;
        report += `**Plan Period:** ${sdmData.planDetails.planStartDate} to ${sdmData.planDetails.planEndDate}\n`;
        report += `**Status:** ${status.toUpperCase()}\n\n`;

        // AI Analysis
        report += `## 🤖 AI SCHEDULING ANALYSIS\n\n`;
        report += `${natural_response}\n\n`;

        // Selected appointments
        if (structured_response.appointments.length > 0) {
            report += `## ✅ SCHEDULED APPOINTMENTS\n\n`;
            
            structured_response.appointments.forEach((apt, index) => {
                const startUTC = new Date(apt.start);
                const endUTC = new Date(apt.end);
                
                // Convert to AEST (UTC+10, but handle DST if needed)
                const startAEST = new Date(startUTC.getTime() + (10 * 60 * 60 * 1000));
                const endAEST = new Date(endUTC.getTime() + (10 * 60 * 60 * 1000));
                
                const dateFormatOptions = {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Australia/Melbourne'
                };

                const startFormatted = startUTC.toLocaleString('en-AU', dateFormatOptions);
                const endFormatted = endUTC.toLocaleString('en-AU', { ...dateFormatOptions, weekday: undefined, year: undefined, month: undefined, day: undefined });

                report += `### ${index + 1}. ${apt.service}\n`;
                report += `- **📅 Date & Time:** ${startFormatted} - ${endFormatted} (AEST)\n`;
                report += `- **📍 Location:** ${apt.locationId}\n`;
                report += `- **🏥 Session Type:** ${apt.isReportingSession ? 'Reporting Session' : 'Non-Reporting Session'}\n`;
                report += `- **⏰ Day Pattern:** ${apt.dayOfWeek} ${apt.timeOfDay}\n`;
                report += `- **📝 Notes:** ${apt.note}\n\n`;
            });
        }

        // Issues requiring attention
        if (structured_response.issues.length > 0) {
            report += `## ⚠️ SCHEDULING ISSUES\n\n`;
            
            structured_response.issues.forEach((issue, index) => {
                report += `### ${index + 1}. ${issue.service}\n`;
                report += `- **❌ Issue:** ${issue.issue}\n`;
                report += `- **💡 Recommendation:** ${issue.recommendation}\n\n`;
            });
        }

        // Schedule summary
        report += `## 📊 SCHEDULE SUMMARY\n\n`;
        report += `${structured_response.schedulePlanSummary}\n\n`;

        // Next steps
        if (structured_response.issues.length > 0) {
            report += `## 🔄 NEXT STEPS\n\n`;
            report += `1. Review and address the ${structured_response.issues.length} scheduling issue(s) listed above\n`;
            report += `2. Consider adjusting date ranges or preferences for problematic appointments\n`;
            report += `3. Re-run the scheduler after making adjustments\n`;
            report += `4. Confirm selected appointments with participant and practitioner\n\n`;
        } else {
            report += `## 🎉 READY TO PROCEED\n\n`;
            report += `All appointments have been successfully scheduled! Next steps:\n`;
            report += `1. Confirm appointments with participant and practitioner\n`;
            report += `2. Send calendar invitations\n`;
            report += `3. Set up any required travel arrangements\n\n`;
        }

        report += `---\n`;
        report += `*Report generated on ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })} AEST*\n`;

        return report;
    }

    /**
     * Helper method to run scheduler from file inputs
     * @param {string} sdmFilePath - Path to SDM file
     * @param {string} schedulingInstructions - Additional instructions
     * @param {number} practitionerId - Practitioner ID
     * @param {string} startDate - Start date for availability
     * @param {string} endDate - End date for availability
     * @returns {Object} Complete scheduling results
     */
    async scheduleFromFile(sdmFilePath, schedulingInstructions = '', practitionerId = 46932, startDate = '2025-08-01', endDate = '2025-08-31') {
        const sdmInput = fs.readFileSync(sdmFilePath, 'utf8');
        return await this.scheduleAppointments(sdmInput, schedulingInstructions, practitionerId, startDate, endDate);
    }
}

export { MasterScheduler };