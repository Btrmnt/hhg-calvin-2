#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs';
import { MasterScheduler } from './scripts/master-scheduler.js';

async function testMasterScheduler() {
    try {
        console.log('🚀 Testing Master Scheduler - Complete End-to-End Process\n');
        console.log('='.repeat(60) + '\n');

        // Create scheduler instance
        const scheduler = new MasterScheduler();

        // Define scheduling instructions
        const schedulingInstructions = `
SPECIAL SCHEDULING INSTRUCTIONS:
- Jane Doe prefers morning appointments when possible
        `;

        console.log('📋 SCHEDULING PARAMETERS:');
        console.log('- SDM File: sdm-csv-example.txt');
        console.log('- Practitioner ID: 46932');
        console.log('- Availability Period: Dynamic (extracted from SDM data)');
        console.log('- Special Instructions: Morning preference, consistency patterns');
        console.log();

        // Run the complete scheduling process
        console.log(`🕐 Test started at: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })} AEST\n`);
        const startTime = Date.now();
        
        const results = await scheduler.scheduleFromFile(
            './sdm-csv-example.txt',
            schedulingInstructions,
            46932,
            '2025-08-01',
            '2025-08-31'
        );

        const endTime = Date.now();
        const processingTime = ((endTime - startTime) / 1000).toFixed(2);

        console.log('='.repeat(60));
        console.log('🎉 MASTER SCHEDULER RESULTS');
        console.log('='.repeat(60) + '\n');

        // Display summary
        console.log('📊 TEST PROCESSING SUMMARY:');
        console.log(`- Total Test Processing Time: ${processingTime} seconds`);
        console.log(`- Test Finished at: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })} AEST`);
        console.log(`- Participant: ${results.summary.participant}`);
        console.log(`- Appointments Required: ${results.summary.totalAppointmentsRequired}`);
        console.log(`- Appointments Scheduled: ${results.summary.totalAppointmentsSelected}`);
        console.log(`- Issues Identified: ${results.summary.totalIssues}`);
        console.log(`- Overall Status: ${results.summary.status.toUpperCase()}`);
        console.log();

        // Display availability summary
        console.log('📅 AVAILABILITY SUMMARY:');
        console.log(`- Practitioner: ${results.availability.practitionerId}`);
        console.log(`- Period: ${results.availability.dateRange.startDate} to ${results.availability.dateRange.endDate}`);
        console.log(`- Free Slots Available: ${results.availability.totalFreeSlots}`);
        console.log(`- Total Free Minutes: ${results.availability.totalFreeMinutes}`);
        console.log();

        // Display individual appointment processing results
        console.log('📝 APPOINTMENT PROCESSING DETAILS:');
        results.appointmentResults.forEach((result, index) => {
            console.log(`${index + 1}. ${result.appointment.service}`);
            console.log(`   Duration: ${result.appointment.duration} minutes + ${result.appointment.travelTime} min travel`);
            console.log(`   Date Range: ${result.appointment.dateRangeStart} to ${result.appointment.dateRangeEnd}`);
            console.log(`   Reporting Session: ${result.appointment.isReportingSession}`);
            console.log(`   Suggestions Generated: ${result.suggestions.summary.totalAppointmentsSuggested}`);
            console.log(`   Valid Options: ${result.suggestions.summary.totalValid}`);
            console.log(`   Conflicted Options: ${result.suggestions.summary.totalConflicted}`);
            console.log();
        });

        // Display human-readable report
        console.log('='.repeat(60));
        console.log('📄 HUMAN-READABLE SCHEDULING REPORT');
        console.log('='.repeat(60) + '\n');
        
        console.log(results.humanReadableReport);

        // Results available in memory for further processing if needed
        console.log('💾 Complete results available in memory\n');

        // Display quick action summary
        if (results.summary.status === 'success') {
            console.log('✅ SUCCESS: All appointments have been scheduled successfully!');
            console.log('📞 Next steps: Contact participant and practitioner to confirm appointments.');
        } else if (results.summary.status === 'partial_success') {
            console.log('⚠️  PARTIAL SUCCESS: Some appointments scheduled, but issues require attention.');
            console.log(`📞 Next steps: Address ${results.summary.totalIssues} scheduling issues and re-run if needed.`);
        } else {
            console.log('❌ FAILURE: Unable to schedule appointments due to conflicts or constraints.');
            console.log('📞 Next steps: Review availability, adjust preferences, or expand date ranges.');
        }

        console.log();
        console.log('='.repeat(60));
        console.log('🎊 Master Scheduler Test Completed Successfully!');
        console.log('='.repeat(60));

        return results;

    } catch (error) {
        console.error('❌ Error testing Master Scheduler:', error.message);
        if (error.stack) {
            console.error('\nStack trace:', error.stack);
        }
        process.exit(1);
    }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testMasterScheduler();
}

export { testMasterScheduler };