import 'dotenv/config';

class ConflictChecker {
    /**
     * Checks suggested appointments for conflicts with practitioner availability
     * @param {Object} practitionerAvailability - Availability data matching practitioner-46932-availability.json format
     * @param {Object} suggestedAppointments - Output from AppointmentSuggestionEngine
     * @returns {Object} Enhanced suggestions with conflict status added to each appointment
     */
    checkConflicts(practitionerAvailability, suggestedAppointments) {
        // Create enhanced suggestions structure that preserves original data
        const enhancedSuggestions = {
            ...suggestedAppointments,
            suggestedAppointments: [],
            summary: {
                ...suggestedAppointments.summary,
                totalValid: 0,
                totalConflicted: 0,
                validationErrors: []
            }
        };

        // Validate input structure
        if (!practitionerAvailability || !practitionerAvailability.freeTimeSlots) {
            enhancedSuggestions.summary.validationErrors.push('Invalid practitioner availability data structure');
            return enhancedSuggestions;
        }

        if (!suggestedAppointments || !suggestedAppointments.suggestedAppointments) {
            enhancedSuggestions.summary.validationErrors.push('Invalid suggested appointments data structure');
            return enhancedSuggestions;
        }

        // Extract free time slots for easier processing
        const freeSlots = practitionerAvailability.freeTimeSlots.map(slot => ({
            start: new Date(slot.startDateTime),
            end: new Date(slot.endDateTime),
            locationId: slot.locationId,
            originalSlot: slot
        }));

        // Check each suggested appointment and build enhanced suggestions
        for (const appointment of suggestedAppointments.suggestedAppointments) {
            const conflictCheck = this.checkSingleAppointment(appointment, freeSlots);
            
            // Add conflict status to each appointment
            const enhancedAppointment = {
                ...appointment,
                hasConflict: !conflictCheck.isValid,
                conflictDetails: conflictCheck.isValid ? null : conflictCheck.conflicts,
                matchedSlot: conflictCheck.isValid ? conflictCheck.matchedSlot : null
            };
            
            enhancedSuggestions.suggestedAppointments.push(enhancedAppointment);
            
            // Update counters
            if (conflictCheck.isValid) {
                enhancedSuggestions.summary.totalValid++;
            } else {
                enhancedSuggestions.summary.totalConflicted++;
            }
        }

        return enhancedSuggestions;
    }

    /**
     * Check a single appointment against available time slots
     * @param {Object} appointment - Single suggested appointment
     * @param {Array} freeSlots - Processed free time slots
     * @returns {Object} Validation result for the appointment
     */
    checkSingleAppointment(appointment, freeSlots) {
        const result = {
            isValid: false,
            conflicts: [],
            matchedSlot: null,
            timeWithinSlot: false
        };

        try {
            // Parse appointment times
            const appointmentStart = new Date(appointment.start);
            const appointmentEnd = new Date(appointment.end);

            // Validate appointment times
            if (isNaN(appointmentStart.getTime()) || isNaN(appointmentEnd.getTime())) {
                result.conflicts.push('Invalid appointment start or end time format');
                return result;
            }

            if (appointmentStart >= appointmentEnd) {
                result.conflicts.push('Appointment start time must be before end time');
                return result;
            }

            // Check against each free slot
            for (const slot of freeSlots) {
                // Check if appointment fits entirely within this slot
                if (appointmentStart >= slot.start && appointmentEnd <= slot.end) {
                    // Check location match if specified
                    if (appointment.locationId && slot.locationId && 
                        appointment.locationId !== slot.locationId) {
                        continue; // Location mismatch, try next slot
                    }

                    result.isValid = true;
                    result.matchedSlot = slot.originalSlot;
                    result.timeWithinSlot = true;
                    return result;
                }

                // Check for partial overlaps (conflicts)
                if (this.hasTimeOverlap(appointmentStart, appointmentEnd, slot.start, slot.end)) {
                    result.conflicts.push({
                        type: 'partial_overlap',
                        slotStart: slot.start.toISOString(),
                        slotEnd: slot.end.toISOString(),
                        overlapStart: new Date(Math.max(appointmentStart.getTime(), slot.start.getTime())).toISOString(),
                        overlapEnd: new Date(Math.min(appointmentEnd.getTime(), slot.end.getTime())).toISOString()
                    });
                }
            }

            // If we get here, no valid slot was found
            if (result.conflicts.length === 0) {
                result.conflicts.push('No available time slot found for this appointment');
            }

        } catch (error) {
            result.conflicts.push(`Error processing appointment: ${error.message}`);
        }

        return result;
    }

    /**
     * Check if two time ranges overlap
     * @param {Date} start1 - Start of first range
     * @param {Date} end1 - End of first range  
     * @param {Date} start2 - Start of second range
     * @param {Date} end2 - End of second range
     * @returns {boolean} True if ranges overlap
     */
    hasTimeOverlap(start1, end1, start2, end2) {
        return start1 < end2 && end1 > start2;
    }

    /**
     * Generate a detailed conflict report
     * @param {Object} conflictResults - Results from checkConflicts
     * @returns {string} Human-readable report
     */
    generateReport(enhancedSuggestions) {
        const { suggestedAppointments, summary } = enhancedSuggestions;
        
        // Separate appointments by conflict status
        const validAppointments = suggestedAppointments.filter(apt => !apt.hasConflict);
        const conflictedAppointments = suggestedAppointments.filter(apt => apt.hasConflict);
        
        let report = `=== APPOINTMENT CONFLICT ANALYSIS ===\n\n`;
        
        report += `SUMMARY:\n`;
        report += `- Total Suggested: ${summary.totalSuggested}\n`;
        report += `- Valid Appointments: ${summary.totalValid}\n`;
        report += `- Conflicted Appointments: ${summary.totalConflicted}\n`;
        report += `- Validation Errors: ${summary.validationErrors.length}\n\n`;

        if (summary.validationErrors.length > 0) {
            report += `VALIDATION ERRORS:\n`;
            summary.validationErrors.forEach(error => {
                report += `- ${error}\n`;
            });
            report += `\n`;
        }

        if (validAppointments.length > 0) {
            report += `VALID APPOINTMENTS:\n`;
            validAppointments.forEach((apt, index) => {
                report += `${index + 1}. ${apt.service}\n`;
                report += `   Time: ${apt.start} to ${apt.end}\n`;
                report += `   Location: ${apt.locationId}\n`;
                report += `   Confidence: ${apt.confidence}\n`;
                report += `   Matched Slot: ${apt.matchedSlot.startDateTime} to ${apt.matchedSlot.endDateTime}\n\n`;
            });
        }

        if (conflictedAppointments.length > 0) {
            report += `CONFLICTED APPOINTMENTS:\n`;
            conflictedAppointments.forEach((apt, index) => {
                report += `${index + 1}. ${apt.service}\n`;
                report += `   Time: ${apt.start} to ${apt.end}\n`;
                report += `   Location: ${apt.locationId}\n`;
                report += `   Conflicts:\n`;
                apt.conflictDetails.forEach(conflict => {
                    if (typeof conflict === 'string') {
                        report += `   - ${conflict}\n`;
                    } else {
                        report += `   - ${conflict.type}: ${conflict.slotStart} to ${conflict.slotEnd}\n`;
                    }
                });
                report += `\n`;
            });
        }

        return report;
    }
}

export { ConflictChecker };