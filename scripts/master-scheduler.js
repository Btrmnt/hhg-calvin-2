import 'dotenv/config';
import fs from 'fs';
import { convertSDMToStructured } from './sdm-extractor.js';
import { PractitionerAvailabilityCalculator } from './practitioner-availability.js';
import { AppointmentSuggestionEngine } from './appointment-suggestion-engine.js';
import { ConflictChecker } from './conflict-checker.js';
import { AppointmentSelector } from './appointment-selector.js';
import { getTimezoneAbbr } from './utils/timezone-utils.js';

class MasterScheduler {
    constructor() {
        console.log('🚀 Initializing Master Scheduler...');
        this.availabilityCalculator = new PractitionerAvailabilityCalculator();
        this.suggestionEngine = new AppointmentSuggestionEngine();
        this.conflictChecker = new ConflictChecker();
        this.appointmentSelector = new AppointmentSelector();
        console.log('✅ All scheduling components initialized');
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
        const totalStartTime = Date.now();
        
        console.log('='.repeat(60));
        console.log('🚀 MASTER SCHEDULER - END-TO-END APPOINTMENT SCHEDULING');
        console.log('='.repeat(60));
        console.log(`⚙️  Configuration: Practitioner ${practitionerId}`);
        console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
        console.log(`📅 Date range will be determined from SDM data`);
        console.log();
        
        try {
            // Step 1: Extract structured data from SDM
            const step1StartTime = Date.now();
            console.log('📋 STEP 1: EXTRACTING STRUCTURED DATA FROM SDM');
            console.log('-'.repeat(50));
            const sdmData = await convertSDMToStructured(sdmInput);
            const step1Duration = ((Date.now() - step1StartTime) / 1000).toFixed(2);
            // Extract appointment date range from SDM data
            const appointmentDates = sdmData.appointments.flatMap(apt => [apt.dateRangeStart, apt.dateRangeEnd]);
            const validDates = appointmentDates.filter(date => date && date !== 'undefined');
            const earliestDate = validDates.length > 0 ? validDates.reduce((min, date) => date < min ? date : min) : startDate;
            const latestDate = validDates.length > 0 ? validDates.reduce((max, date) => date > max ? date : max) : endDate;
            
            console.log(`✅ Extracted ${sdmData.appointments.length} appointments for ${sdmData.participant.participantName}`);
            console.log(`📅 Plan period: ${sdmData.planDetails.planStartDate} to ${sdmData.planDetails.planEndDate}`);
            console.log(`📅 Appointment range: ${earliestDate} to ${latestDate}`);
            console.log(`💰 Budget: $${sdmData.planDetails.totalPlanBudget} (${sdmData.planDetails.totalPlanBudgetHours} hours)`);
            console.log(`⏱️  Step 1 completed in ${step1Duration}s`);
            console.log();

            // Step 2: Get practitioner availability
            const step2StartTime = Date.now();
            console.log('📅 STEP 2: CALCULATING PRACTITIONER AVAILABILITY');
            console.log('-'.repeat(50));
            console.log(`🔍 Using dynamic date range from appointments: ${earliestDate} to ${latestDate}`);
            const availability = await this.availabilityCalculator.calculateAvailability(
                practitionerId, 
                earliestDate, 
                latestDate
            );
            const step2Duration = ((Date.now() - step2StartTime) / 1000).toFixed(2);
            console.log(`✅ Found ${availability.summary.totalFreeSlots} free slots`);
            console.log(`⏰ Total available time: ${availability.summary.totalFreeMinutes} minutes`);
            console.log(`📊 Average slot duration: ${(availability.summary.totalFreeMinutes / availability.summary.totalFreeSlots).toFixed(0)} minutes`);
            console.log(`⏱️  Step 2 completed in ${step2Duration}s`);
            console.log();

            // Step 3: Process appointments in parallel
            const step3StartTime = Date.now();
            console.log('🤖 STEP 3: PROCESSING APPOINTMENTS (PARALLEL)');
            console.log('-'.repeat(50));
            
            const appointmentPromises = sdmData.appointments.map(async (appointment, index) => {
                console.log(`📝 [${index + 1}/${sdmData.appointments.length}] Processing: ${appointment.service}`);
                
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
                    JSON.stringify(availability, null, 2),
                    schedulingInstructions
                );

                // Check for conflicts and get enhanced suggestions with conflict status
                const enhancedSuggestions = this.conflictChecker.checkConflicts(availability, suggestions);

                console.log(`   ✅ [${index + 1}] Generated ${enhancedSuggestions.summary.totalAppointmentsSuggested} suggestions`);
                console.log(`   🔍 [${index + 1}] Conflict check: ${enhancedSuggestions.summary.totalValid} valid, ${enhancedSuggestions.summary.totalConflicted} conflicted`);
                
                // Debug: Show all suggestions with conflict status (now directly available)
                if (enhancedSuggestions.suggestedAppointments && enhancedSuggestions.suggestedAppointments.length > 0) {
                    console.log(`   📋 [${index + 1}] Suggestions for ${appointment.service}:`);
                    enhancedSuggestions.suggestedAppointments.forEach((suggestion, sugIndex) => {
                        const status = suggestion.hasConflict ? '❌' : '✅';
                        const startDate = new Date(suggestion.start);
                        const endDate = new Date(suggestion.end);
                        
                        // UTC time with date
                        const utcStart = startDate.toISOString().substring(0, 16).replace('T', ' ');
                        const utcEnd = endDate.toISOString().substring(11, 16);
                        const utcTime = `${utcStart}-${utcEnd}`;
                        
                        // Use practitioner's actual timezone
                        const practitionerTimezone = availability.practitionerTimezone || 'Australia/Melbourne';
                        const timezoneAbbr = getTimezoneAbbr(practitionerTimezone);
                        
                        // Local time in practitioner's timezone
                        const localStart = startDate.toLocaleString('en-AU', { 
                            month: 'short', 
                            day: 'numeric',
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: false,
                            timeZone: practitionerTimezone 
                        });
                        const localEnd = endDate.toLocaleString('en-AU', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: false,
                            timeZone: practitionerTimezone 
                        });
                        
                        const dayOfWeek = startDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: practitionerTimezone });
                        console.log(`      ${sugIndex + 1}. ${status} ${dayOfWeek} ${localStart}-${localEnd} ${timezoneAbbr} | ${utcTime} UTC (${suggestion.confidence})`);
                    });
                }

                return {
                    appointment,
                    suggestions: enhancedSuggestions,
                    index
                };
            });

            const appointmentResults = await Promise.all(appointmentPromises);
            const step3Duration = ((Date.now() - step3StartTime) / 1000).toFixed(2);
            console.log(`✅ Completed parallel processing of ${appointmentResults.length} appointments`);
            console.log(`⏱️  Step 3 completed in ${step3Duration}s`);
            console.log();

            // Step 4: Select optimal appointments
            const step4StartTime = Date.now();
            console.log('🎯 STEP 4: AI APPOINTMENT SELECTION');
            console.log('-'.repeat(50));
            
            const suggestionResults = appointmentResults.map(result => result.suggestions);
            
            const selectionResult = await this.appointmentSelector.selectAppointments(
                sdmData,
                suggestionResults,
                availability,
                schedulingInstructions
            );

            const step4Duration = ((Date.now() - step4StartTime) / 1000).toFixed(2);
            console.log(`✅ Selection completed with status: ${selectionResult.status.toUpperCase()}`);
            console.log(`📋 Selected ${selectionResult.structured_response.appointments.length}/${sdmData.appointments.length} appointments`);
            console.log(`⚠️  ${selectionResult.structured_response.issues.length} issues requiring attention`);
            console.log(`⏱️  Step 4 completed in ${step4Duration}s`);
            console.log();

            // Step 5: Generate comprehensive results
            const step5StartTime = Date.now();
            console.log('📊 STEP 5: GENERATING COMPREHENSIVE RESULTS');
            console.log('-'.repeat(50));
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
                    dateRange: { startDate: earliestDate, endDate: latestDate },
                    totalFreeSlots: availability.summary.totalFreeSlots,
                    totalFreeMinutes: availability.summary.totalFreeMinutes
                },
                appointmentResults,
                selection: selectionResult,
                humanReadableReport: this.generateHumanReadableReport(selectionResult, sdmData, availability.practitionerTimezone)
            };

            const step5Duration = ((Date.now() - step5StartTime) / 1000).toFixed(2);
            console.log('✅ Results compilation completed');
            console.log('📄 Human-readable report generated with AEST timezone');
            console.log(`⏱️  Step 5 completed in ${step5Duration}s`);
            console.log();
            
            // Total timing summary
            const totalDuration = ((Date.now() - totalStartTime) / 1000).toFixed(2);
            console.log('='.repeat(60));
            console.log('🎉 MASTER SCHEDULER COMPLETED SUCCESSFULLY!');
            console.log('='.repeat(60));
            console.log('⏰ TIMING SUMMARY:');
            console.log(`   Step 1 (SDM Extraction): ${step1Duration}s`);
            console.log(`   Step 2 (Availability): ${step2Duration}s`);
            console.log(`   Step 3 (Suggestions + Conflicts): ${step3Duration}s`);
            console.log(`   Step 4 (AI Selection): ${step4Duration}s`);
            console.log(`   Step 5 (Results Generation): ${step5Duration}s`);
            console.log(`   📊 TOTAL TIME: ${totalDuration}s`);
            console.log(`   🏁 Finished at: ${new Date().toLocaleString()}`);
            console.log('='.repeat(60));
            return results;

        } catch (error) {
            console.error('='.repeat(60));
            console.error('❌ MASTER SCHEDULER FAILED');
            console.error('='.repeat(60));
            console.error('💥 Error:', error.message);
            throw error;
        }
    }


    /**
     * Generate human-readable report with practitioner timezone conversion
     * @param {Object} selectionResult - Results from appointment selector
     * @param {Object} sdmData - Original SDM data
     * @param {string} practitionerTimezone - Practitioner's timezone
     * @returns {string} Formatted report
     */
    generateHumanReadableReport(selectionResult, sdmData, practitionerTimezone = 'Australia/Melbourne') {
        const { natural_response, structured_response, status } = selectionResult;
        const timezoneAbbr = getTimezoneAbbr(practitionerTimezone);
        
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
                
                const dateFormatOptions = {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: practitionerTimezone
                };

                const startFormatted = startUTC.toLocaleString('en-AU', dateFormatOptions);
                const endFormatted = endUTC.toLocaleString('en-AU', { ...dateFormatOptions, weekday: undefined, year: undefined, month: undefined, day: undefined });

                report += `### ${index + 1}. ${apt.service}\n`;
                report += `- **📅 Date & Time:** ${startFormatted} - ${endFormatted} (${timezoneAbbr})\n`;
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
                report += `### ${index + 1}. ${issue.service} (Appointment #${issue.appointmentIndex + 1})\n`;
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
        report += `*Report generated on ${new Date().toLocaleString('en-AU', { timeZone: practitionerTimezone })} ${timezoneAbbr}*\n`;

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