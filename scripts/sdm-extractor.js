#!/usr/bin/env node

import fs from 'fs';
import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';

async function convertSDMToMarkdown(csvFilePath) {
    try {
        const csvContent = fs.readFileSync(csvFilePath, 'utf8');
        
        const prompt = `Convert this SDM planning tool CSV data into a structured markdown report following the exact format specified below.

CSV Data:
${csvContent}

Required Output Format:

## Participant

Participant Name: [Extract from CSV]
State: [Extract from CSV]
Service required: [Extract from CSV]

Participant preferences for suitable day/s of the week for appointments: [Extract data from "Suitable day/s of the week:" field]
Participant preferences for suitable time of day for appointments: [Extract data from "Suitable time of day:" field]

## Plan details

Plan dates: [Extract plan start and end dates]
Total plan budget: [Extract total budget]
Total plan budget (indicative hours)*: [Extract indicative hours]

## Service planning

Intake date: [Extract intake date]
Service commencement: [Extract service commencement date]
Travel required: [Extract travel requirement]
Last participant of the day (LPOD): [Extract LPOD status]
Service frequency: [Extract service frequency]

## Appointments to plan:

Extract data from the "Appointments to plan:" list into a table following these rules:
- The table should have the following headings:
  - Date range - a single column that lists TWO dates between which this appointment should be scheduled
  - Service - the name of the service
  - Duration - the length of the appointment in hours and minutes, excluding travel time, as listed in the "TIME" column
  - Travel time - the allocated travel time for the appointment's service type in hours and minutes, as listed in the "SERVICE DETAIL" section
  - Total time - the total time needed in the calendar for this appointment in hours and minutes, i.e. duration + travel time
  - Cost - the individual cost for this appointment, as listed in the "COST" column
  - Cumulative cost - the cumulative cost for this appointment, as listed in the "TOTAL" column
- IGNORE appointments that have a cumulative cost in the "TOTAL" column that exceeds the "Total Plan Budget ($)"
- IGNORE appointments that have a service type of "Clinical Intake" - This appointment should have already been scheduled and booked
- Check each appointment service in the "SERVICE DETAIL" section (i.e match the service in the "SERVICE" column to the service header in the "SERVICE DETAIL" section).
  - For any appointment with a service type that includes a "Report" component, that component should be listed as a separate appointment in the final output, with the same date range as the original appointment, and with no associated travel or cost. The original appointment duration should be reduced by the time allocated for the report.
  - For each appointment, provider travel time should be extracted from the "SERVICE DETAIL" section for the associated service type, as described above

Please analyze the CSV data carefully and create the markdown output following these exact specifications.

Whenever specifying years, use four characters (e.g., 2023, not 23).`;

        const modelConfig = {
            // modelName: "gpt-4o",
            modelName: "o3",
            // temperature: 0.1,
            temperature: 1,
        };

        const model = new ChatOpenAI({
            ...modelConfig,
            openAIApiKey: process.env.OPENAI_API_KEY,
        });
        
        console.log('Prompt length:', prompt.length);
        console.log('Model config:', modelConfig);
        
        const startTime = Date.now();
        let response;
        try {
            const messages = [new HumanMessage(prompt)];
            response = await model.invoke(messages);
        } catch (error) {
            console.error('LangChain call error:', error.message);
            console.error('Error details:', error);
            throw error;
        }
        const endTime = Date.now();
        
        console.log('LangChain call time:', (endTime - startTime) + 'ms');
        console.log('Response type:', typeof response);
        console.log('Response keys:', Object.keys(response || {}));
        
        // LangChain response structure
        const content = response.content;
        console.log('Content length:', content?.length);
        console.log('Content type:', typeof content);
        console.log('Content preview:', JSON.stringify(content?.substring(0, 100)));
        
        // Log token usage if available
        if (response.usage_metadata) {
            console.log('Token usage:', response.usage_metadata);
        }
        
        return content;
        
    } catch (error) {
        console.error('Error converting SDM to markdown:', error);
        throw error;
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node sdm-extractor.js <csv-file-path>');
        console.log('Example: node sdm-extractor.js sdm-csv-example.txt');
        process.exit(1);
    }
    
    const csvFilePath = args[0];
    
    if (!fs.existsSync(csvFilePath)) {
        console.error(`Error: File ${csvFilePath} does not exist`);
        process.exit(1);
    }
    
    try {
        console.log(`Converting ${csvFilePath} to markdown...`);
        const markdown = await convertSDMToMarkdown(csvFilePath);
        
        console.log('\n=== CONVERTED MARKDOWN ===\n');
        console.log(markdown);
        
        const outputPath = csvFilePath.replace(/\.[^/.]+$/, '') + '-converted.md';
        fs.writeFileSync(outputPath, markdown);
        console.log(`\nMarkdown saved to: ${outputPath}`);
        
    } catch (error) {
        console.error('Conversion failed:', error.message);
        process.exit(1);
    }
}

export { convertSDMToMarkdown };

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}