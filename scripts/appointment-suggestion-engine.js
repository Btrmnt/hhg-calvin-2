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
        reasoning: z.string().describe("Explanation of why this time slot is optimal")
    })),
    summary: z.object({
        totalAppointmentsSuggested: z.number(),
        schedulingConflicts: z.array(z.string()),
        recommendations: z.array(z.string())
    })
});

class AppointmentSuggestionEngine {
    constructor() {
        this.model = new ChatOpenAI({
            modelName: "gpt-4o",
            temperature: 0.3,
            openAIApiKey: process.env.OPENAI_API_KEY,
        });
        
        this.structuredModel = this.model.withStructuredOutput(appointmentSuggestionSchema);
    }


    async callLLM(availabilityData, appointmentInstructions) {
        const prompt = `You are an expert appointment scheduling assistant. You will receive practitioner availability data and instructions about appointments that need to be scheduled.

PRACTITIONER AVAILABILITY DATA:
${availabilityData}

APPOINTMENT INSTRUCTIONS:
${appointmentInstructions}

Please analyze the availability and instructions to suggest optimal appointment times. Unless otherwise specified in the instructions, provide 5 different time slot suggestions for each requested appointment. Consider:
1. Available time slots from the practitioner's schedule
2. Date ranges or timing preferences specified in instructions
3. Duration and travel time requirements mentioned
4. Participant preferences and constraints
5. Optimal scheduling to minimize conflicts and maximize efficiency
6. Service types and their specific requirements
7. Non-reporting sessions should typically be scheduled from Monday mornings through to Thursday lunch times where possible. Reporting sessions should be scheduled from Thursday afternoons through to Friday afternoons where possible.

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
- reasoning: Explanation of why this time slot is optimal

Also provide a summary with:
- totalAppointmentsSuggested: Number of appointment suggestions you provided
- schedulingConflicts: Array of any conflicts or issues found
- recommendations: General scheduling advice`;

        console.log('Calling LangChain with structured output...');
        const startTime = Date.now();
        
        try {
            const messages = [new HumanMessage(prompt)];
            const response = await this.structuredModel.invoke(messages);
            const endTime = Date.now();
            
            console.log('LangChain call time:', (endTime - startTime) + 'ms');
            console.log('Structured response received successfully');
            
            return response;
        } catch (error) {
            console.error('LangChain call error:', error.message);
            throw error;
        }
    }

    async suggestAppointments(availabilityData, appointmentInstructions) {
        console.log('Processing availability data and appointment instructions...');
        
        console.log('Calling LLM for appointment suggestions...');
        
        const suggestions = await this.callLLM(availabilityData, appointmentInstructions);
        
        return {
            ...suggestions,
            timestamp: new Date().toISOString()
        };
    }
}

export { AppointmentSuggestionEngine };