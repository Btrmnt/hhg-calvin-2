import 'dotenv/config';

/**
 * Calculates available time slots for a practitioner by comparing their 
 * availability windows with existing appointments.
 */

class PractitionerAvailabilityCalculator {
    constructor() {
        this.windmillBaseUrl = process.env.WINDMILL_BASE_URL;
        this.windmillWorkspaceId = process.env.WINDMILL_WORKSPACE_ID;
        this.windmillToken = process.env.WINDMILL_TOKEN;
        
        if (!this.windmillBaseUrl || !this.windmillWorkspaceId || !this.windmillToken) {
            throw new Error('Missing required environment variables: WINDMILL_BASE_URL, WINDMILL_WORKSPACE_ID, WINDMILL_TOKEN');
        }
    }

    /**
     * Retrieves the existing schedule for a specified practitioner from Splose
     */
    async getPractitionerCurrentSchedule(practitionerId, startDateFrom = null, startDateTo = null) {
        console.log(`Fetching schedule for practitioner ${practitionerId} from ${startDateFrom} to ${startDateTo}`);
        
        const url = `${this.windmillBaseUrl}/api/w/${this.windmillWorkspaceId}/jobs/run_wait_result/f/f/splose/get_practitioner_schedule`;
        const headers = {
            'Authorization': `Bearer ${this.windmillToken}`,
            'Content-Type': 'application/json',
        };
        
        const data = {
            practitionerId: practitionerId,
        };
        
        // Only include date parameters if provided
        if (startDateFrom !== null) {
            data.startDateFrom = startDateFrom;
        }
        if (startDateTo !== null) {
            data.startDateTo = startDateTo;
        }
        
        try {
            console.log(`HTTP request to Windmill: POST ${url}`);
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data)
            });
            
            if (response.status === 200) {
                const result = await response.json();
                return {
                    status: 'success',
                    data: result
                };
            } else {
                const errorText = await response.text();
                return {
                    status: 'error',
                    error_message: `Failed to retrieve schedule for practitioner ${practitionerId}. ${response.status} ${errorText}`
                };
            }
        } catch (error) {
            return {
                status: 'error',
                error_message: `Network error retrieving schedule: ${error.message}`
            };
        }
    }

    /**
     * Retrieves availability entries for a specified practitioner from Splose
     */
    async getPractitionerCurrentAvailability(practitionerId, startDate, endDate) {
        console.log(`Fetching availability for practitioner ${practitionerId} from ${startDate} to ${endDate}`);
        
        const url = `${this.windmillBaseUrl}/api/w/${this.windmillWorkspaceId}/jobs/run_wait_result/f/f/splose/get_practitioner_availabilities`;
        const headers = {
            'Authorization': `Bearer ${this.windmillToken}`,
            'Content-Type': 'application/json',
        };
        
        const data = {
            practitionerId: practitionerId,
            startDate: startDate,
            endDate: endDate,
        };
        
        try {
            console.log(`HTTP request to Windmill: POST ${url}`);
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data)
            });
            
            if (response.status === 200) {
                const result = await response.json();
                return {
                    status: 'success',
                    data: result
                };
            } else {
                const errorText = await response.text();
                return {
                    status: 'error',
                    error_message: `Failed to retrieve availability for practitioner ${practitionerId}. ${response.status} ${errorText}`
                };
            }
        } catch (error) {
            return {
                status: 'error',
                error_message: `Network error retrieving availability: ${error.message}`
            };
        }
    }

    /**
     * Converts availability data to consistent format (availability is already expanded)
     */
    parseAvailabilitySlots(availabilityData) {
        const slots = [];
        
        for (const availability of availabilityData.data) {
            const slotStart = new Date(availability.startDateTime);
            const slotEnd = new Date(availability.endDateTime);
            const duration = slotEnd - slotStart; // duration in ms
            
            slots.push({
                locationId: availability.locationId,
                startDateTime: new Date(slotStart),
                endDateTime: new Date(slotEnd),
                duration: duration
            });
        }
        
        return slots.sort((a, b) => a.startDateTime - b.startDateTime);
    }

    /**
     * Calculates free time slots by subtracting appointments from availability
     */
    calculateFreeTimeSlots(availabilitySlots, appointments) {
        const freeSlots = [];
        
        // Convert appointments to simpler format
        const bookedSlots = appointments.map(apt => ({
            start: new Date(apt.start),
            end: new Date(apt.end)
        })).sort((a, b) => a.start - b.start);
        
        for (const availSlot of availabilitySlots) {
            let currentStart = new Date(availSlot.startDateTime);
            const slotEnd = new Date(availSlot.endDateTime);
            
            // Find appointments that overlap with this availability slot
            const overlappingAppointments = bookedSlots.filter(apt => 
                apt.start < slotEnd && apt.end > currentStart
            );
            
            if (overlappingAppointments.length === 0) {
                // No appointments in this slot - entire slot is free
                freeSlots.push({
                    startDateTime: new Date(currentStart),
                    endDateTime: new Date(slotEnd),
                    duration: slotEnd - currentStart,
                    locationId: availSlot.locationId
                });
            } else {
                // Process appointments chronologically to find gaps
                for (const appointment of overlappingAppointments) {
                    // If there's time before this appointment
                    if (currentStart < appointment.start) {
                        freeSlots.push({
                            startDateTime: new Date(currentStart),
                            endDateTime: new Date(appointment.start),
                            duration: appointment.start - currentStart,
                            locationId: availSlot.locationId
                        });
                    }
                    
                    // Move start time to after this appointment
                    currentStart = new Date(Math.max(currentStart, appointment.end));
                }
                
                // If there's time after all appointments in this slot
                if (currentStart < slotEnd) {
                    freeSlots.push({
                        startDateTime: new Date(currentStart),
                        endDateTime: new Date(slotEnd),
                        duration: slotEnd - currentStart,
                        locationId: availSlot.locationId
                    });
                }
            }
        }
        
        return freeSlots.sort((a, b) => a.startDateTime - b.startDateTime);
    }

    /**
     * Main function to calculate practitioner availability
     */
    async calculateAvailability(practitionerId, startDate, endDate) {
        console.log(`\nCalculating availability for practitioner ${practitionerId}`);
        console.log(`Date range: ${startDate} to ${endDate}\n`);
        
        // Fetch schedule and availability data
        const [scheduleResult, availabilityResult] = await Promise.all([
            this.getPractitionerCurrentSchedule(practitionerId, startDate, endDate),
            this.getPractitionerCurrentAvailability(practitionerId, startDate, endDate)
        ]);
        
        if (scheduleResult.status === 'error') {
            throw new Error(scheduleResult.error_message);
        }
        
        if (availabilityResult.status === 'error') {
            throw new Error(availabilityResult.error_message);
        }
        
        console.log(`Found ${scheduleResult.data.appointments?.length || 0} appointments`);
        console.log(`Found ${availabilityResult.data.data?.length || 0} availability entries\n`);
        
        // Parse availability slots (already expanded from Windmill)
        const availabilitySlots = this.parseAvailabilitySlots(availabilityResult.data);
        
        console.log(`Parsed ${availabilitySlots.length} availability slots`);
        
        // Calculate free time by removing appointments from availability
        const freeTimeSlots = this.calculateFreeTimeSlots(
            availabilitySlots,
            scheduleResult.data.appointments || []
        );
        
        console.log(`Calculated ${freeTimeSlots.length} free time slots\n`);
        
        return {
            practitionerId: practitionerId,
            dateRange: {
                start: startDate,
                end: endDate
            },
            summary: {
                totalAvailabilityPeriods: availabilitySlots.length,
                totalAppointments: scheduleResult.data.appointments?.length || 0,
                totalFreeSlots: freeTimeSlots.length,
                totalFreeMinutes: freeTimeSlots.reduce((sum, slot) => sum + (slot.duration / (1000 * 60)), 0)
            },
            freeTimeSlots: freeTimeSlots.map(slot => ({
                startDateTime: slot.startDateTime.toISOString(),
                endDateTime: slot.endDateTime.toISOString(),
                duration: `${Math.floor(slot.duration / (1000 * 60))} minutes`,
                durationMs: slot.duration,
                locationId: slot.locationId
            }))
        };
    }
}

export { PractitionerAvailabilityCalculator };