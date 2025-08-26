import 'dotenv/config';
import fs from 'fs';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

const appointmentSuggestionSchema = z.object({
    suggestions: z.array(z.object({
        // Core appointment fields (aligned with Pydantic class)
        start: z.string().describe("The start time of the appointment in ISO format (YYYY-MM-DDTHH:MM:SSZ)"),
        end: z.string().describe("The end time of the appointment in ISO format (YYYY-MM-DDTHH:MM:SSZ)"),
        serviceId: z.number().describe("The ID of the service"),
        locationId: z.number().describe("The ID of the location"),
        practitionerId: z.number().describe("The ID of the practitioner"),
        patientId: z.number().describe("The ID of the patient"),
        caseId: z.number().optional().describe("The ID of the case associated with this appointment"),
        note: z.string().optional().describe("Descriptive title of the appointment"),
        
        // Additional scheduling fields
        appointmentIndex: z.number().describe("Sequential number starting from 0"),
        service: z.string().describe("Name of the service being scheduled"),
        duration: z.string().describe("Human-readable duration string (e.g., '1 h 30 m')"),
        confidence: z.enum(['low', 'medium', 'high']).describe("Confidence level in this suggestion"),
        reasoning: z.string().describe("Explanation of why this time slot is optimal")
    })),
    summary: z.object({
        totalAppointmentsScheduled: z.number(),
        schedulingConflicts: z.array(z.string()),
        recommendations: z.array(z.string())
    })
});

class AppointmentScheduler {
    constructor() {
        this.model = new ChatOpenAI({
            modelName: "o3",
            temperature: 1,
            openAIApiKey: process.env.OPENAI_API_KEY,
        });
        
        this.structuredModel = this.model.withStructuredOutput(appointmentSuggestionSchema);
    }

    async readFile(filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error.message}`);
        }
    }

    async callO3LLM(availabilityContent, participantContent) {
        const prompt = `You are an expert appointment scheduling assistant. Given a practitioner's availability and participant requirements, suggest optimal appointment times.

PRACTITIONER AVAILABILITY:
${availabilityContent}

PARTICIPANT DATA:
${participantContent}

Please analyze the availability and requirements, then suggest optimal appointment times for each required appointment. Consider:
1. The date ranges specified for each appointment
2. The duration and travel time requirements
3. Any participant preferences mentioned
4. Optimal scheduling to minimize gaps and maximize efficiency

For each appointment suggestion, provide:
- start: Start time in ISO format (YYYY-MM-DDTHH:MM:SSZ)
- end: End time in ISO format (YYYY-MM-DDTHH:MM:SSZ)
- serviceId: ID of the service (extract or infer from participant data)
- locationId: ID of the location (from availability data)
- practitionerId: ID of the practitioner (from availability data)
- patientId: ID of the patient (extract or infer from participant data)
- caseId: ID of the case if available (optional)
- note: Descriptive title of the appointment (optional)
- appointmentIndex: Sequential number starting from 0
- service: Name of the service being scheduled
- duration: Human-readable duration string (e.g., "1 h 30 m")
- confidence: Your confidence level (low/medium/high) in this suggestion
- reasoning: Explanation of why this time slot is optimal

Also provide a summary with:
- totalAppointmentsScheduled: Number of appointments you were able to schedule
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

    async scheduleAppointments(availabilityFile, participantFile) {
        console.log('Reading input files...');
        
        const availabilityContent = await this.readFile(availabilityFile);
        const participantContent = await this.readFile(participantFile);
        
        console.log('Calling o3 LLM for scheduling suggestions...');
        
        const suggestions = await this.callO3LLM(availabilityContent, participantContent);
        
        return {
            availabilityFile,
            participantFile,
            suggestions,
            timestamp: new Date().toISOString()
        };
    }
}

export { AppointmentScheduler };