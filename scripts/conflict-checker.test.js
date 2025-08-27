import { ConflictChecker } from './conflict-checker.js';

describe('ConflictChecker', () => {
    let conflictChecker;

    beforeEach(() => {
        conflictChecker = new ConflictChecker();
    });

    const mockPractitionerAvailability = {
        practitionerId: 46932,
        dateRange: {
            start: "2025-08-01T00:00:00",
            end: "2025-08-31T23:59:59"
        },
        freeTimeSlots: [
            {
                startDateTime: "2025-08-26T00:40:00.000Z",
                endDateTime: "2025-08-26T07:00:00.000Z",
                duration: "380 minutes",
                durationMs: 22800000,
                locationId: 19042
            },
            {
                startDateTime: "2025-08-27T23:00:00.000Z",
                endDateTime: "2025-08-28T07:00:00.000Z",
                duration: "480 minutes",
                durationMs: 28800000,
                locationId: 19042
            },
            {
                startDateTime: "2025-08-28T23:00:00.000Z",
                endDateTime: "2025-08-29T07:00:00.000Z",
                duration: "480 minutes",
                durationMs: 28800000,
                locationId: 19042
            }
        ]
    };

    describe('checkConflicts - No Conflicts', () => {
        test('should return no conflicts for valid appointments within availability', () => {
            const suggestedAppointments = {
                suggestedAppointments: [
                    {
                        start: "2025-08-26T01:00:00Z",
                        end: "2025-08-26T02:40:00Z",
                        serviceId: 101,
                        locationId: 19042,
                        practitionerId: 46932,
                        patientId: 12345,
                        caseId: 67890,
                        note: "Intervention (Direct) - Psychology",
                        appointmentIndex: 0,
                        service: "Intervention (Direct)",
                        duration: "1 h 40 m",
                        confidence: "high"
                    },
                    {
                        start: "2025-08-28T00:00:00Z",
                        end: "2025-08-28T01:40:00Z",
                        serviceId: 101,
                        locationId: 19042,
                        practitionerId: 46932,
                        patientId: 12345,
                        caseId: 67890,
                        note: "Intervention (Direct) - Psychology",
                        appointmentIndex: 1,
                        service: "Intervention (Direct)",
                        duration: "1 h 40 m",
                        confidence: "high"
                    }
                ],
                summary: {
                    totalAppointmentsSuggested: 2,
                    schedulingConflicts: [],
                    recommendations: []
                }
            };

            const result = conflictChecker.checkConflicts(mockPractitionerAvailability, suggestedAppointments);

            expect(result.conflictedAppointments).toHaveLength(0);
            expect(result.validAppointments).toHaveLength(2);
            expect(result.summary.totalConflicted).toBe(0);
            expect(result.summary.totalValid).toBe(2);
        });

        test('should handle appointments at exact boundary times', () => {
            const suggestedAppointments = {
                suggestedAppointments: [
                    {
                        start: "2025-08-26T00:40:00Z",
                        end: "2025-08-26T02:20:00Z",
                        serviceId: 101,
                        locationId: 19042,
                        practitionerId: 46932,
                        patientId: 12345,
                        caseId: 67890,
                        note: "Boundary test",
                        appointmentIndex: 0
                    }
                ],
                summary: {
                    totalAppointmentsSuggested: 1,
                    schedulingConflicts: [],
                    recommendations: []
                }
            };

            const result = conflictChecker.checkConflicts(mockPractitionerAvailability, suggestedAppointments);

            expect(result.conflictedAppointments).toHaveLength(0);
            expect(result.validAppointments).toHaveLength(1);
        });
    });

    describe('checkConflicts - With Conflicts', () => {
        test('should detect conflicts for appointments outside availability windows', () => {
            const suggestedAppointments = {
                suggestedAppointments: [
                    {
                        start: "2025-08-25T10:00:00Z",
                        end: "2025-08-25T11:40:00Z",
                        serviceId: 101,
                        locationId: 19042,
                        practitionerId: 46932,
                        patientId: 12345,
                        caseId: 67890,
                        note: "Conflict test - no availability",
                        appointmentIndex: 0
                    },
                    {
                        start: "2025-08-26T08:00:00Z",
                        end: "2025-08-26T09:40:00Z",
                        serviceId: 101,
                        locationId: 19042,
                        practitionerId: 46932,
                        patientId: 12345,
                        caseId: 67890,
                        note: "Conflict test - after availability ends",
                        appointmentIndex: 1
                    }
                ],
                summary: {
                    totalAppointmentsSuggested: 2,
                    schedulingConflicts: [],
                    recommendations: []
                }
            };

            const result = conflictChecker.checkConflicts(mockPractitionerAvailability, suggestedAppointments);

            expect(result.conflictedAppointments).toHaveLength(2);
            expect(result.validAppointments).toHaveLength(0);
            expect(result.summary.totalConflicted).toBe(2);
            expect(result.summary.totalValid).toBe(0);
            
            expect(result.conflictedAppointments[0].conflicts).toContain('No available time slot found for this appointment');
            expect(result.conflictedAppointments[1].conflicts).toContain('No available time slot found for this appointment');
        });

        test('should detect partial overlap conflicts', () => {
            const suggestedAppointments = {
                suggestedAppointments: [
                    {
                        start: "2025-08-26T06:30:00Z",
                        end: "2025-08-26T08:10:00Z",
                        serviceId: 101,
                        locationId: 19042,
                        practitionerId: 46932,
                        patientId: 12345,
                        caseId: 67890,
                        note: "Partial overlap test",
                        appointmentIndex: 0
                    }
                ],
                summary: {
                    totalAppointmentsSuggested: 1,
                    schedulingConflicts: [],
                    recommendations: []
                }
            };

            const result = conflictChecker.checkConflicts(mockPractitionerAvailability, suggestedAppointments);

            expect(result.conflictedAppointments).toHaveLength(1);
            expect(result.conflictedAppointments[0].conflicts[0].type).toBe('partial_overlap');
        });

        test('should detect wrong location conflicts', () => {
            const suggestedAppointments = {
                suggestedAppointments: [
                    {
                        start: "2025-08-26T01:00:00Z",
                        end: "2025-08-26T02:40:00Z",
                        serviceId: 101,
                        locationId: 99999, // Wrong location
                        practitionerId: 46932,
                        patientId: 12345,
                        caseId: 67890,
                        note: "Wrong location test",
                        appointmentIndex: 0
                    }
                ],
                summary: {
                    totalAppointmentsSuggested: 1,
                    schedulingConflicts: [],
                    recommendations: []
                }
            };

            const result = conflictChecker.checkConflicts(mockPractitionerAvailability, suggestedAppointments);

            expect(result.conflictedAppointments).toHaveLength(1);
            expect(result.conflictedAppointments[0].conflicts).toContain('No available time slot found for this appointment');
        });
    });

    describe('generateReport', () => {
        test('should generate detailed report for conflicts', () => {
            const suggestedAppointments = {
                suggestedAppointments: [
                    {
                        start: "2025-08-25T10:00:00Z",
                        end: "2025-08-25T11:40:00Z",
                        serviceId: 101,
                        locationId: 19042,
                        practitionerId: 46932,
                        patientId: 12345,
                        caseId: 67890,
                        note: "Test appointment",
                        appointmentIndex: 0
                    }
                ],
                summary: {
                    totalAppointmentsSuggested: 1,
                    schedulingConflicts: [],
                    recommendations: []
                }
            };

            const result = conflictChecker.checkConflicts(mockPractitionerAvailability, suggestedAppointments);
            const report = conflictChecker.generateReport(result);

            expect(report).toContain('=== APPOINTMENT CONFLICT ANALYSIS ===');
            expect(report).toContain('Conflicted Appointments: 1');
            expect(report).toContain('Valid Appointments: 0');
            expect(report).toContain('CONFLICTED APPOINTMENTS:');
            expect(report).toContain('No available time slot found for this appointment');
        });

        test('should generate report showing no conflicts', () => {
            const suggestedAppointments = {
                suggestedAppointments: [
                    {
                        start: "2025-08-26T01:00:00Z",
                        end: "2025-08-26T02:40:00Z",
                        serviceId: 101,
                        locationId: 19042,
                        practitionerId: 46932,
                        patientId: 12345,
                        caseId: 67890,
                        note: "Valid appointment",
                        appointmentIndex: 0
                    }
                ],
                summary: {
                    totalAppointmentsSuggested: 1,
                    schedulingConflicts: [],
                    recommendations: []
                }
            };

            const result = conflictChecker.checkConflicts(mockPractitionerAvailability, suggestedAppointments);
            const report = conflictChecker.generateReport(result);

            expect(report).toContain('=== APPOINTMENT CONFLICT ANALYSIS ===');
            expect(report).toContain('Conflicted Appointments: 0');
            expect(report).toContain('Valid Appointments: 1');
            expect(report).toContain('VALID APPOINTMENTS:');
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty suggested appointments', () => {
            const emptySuggestions = {
                suggestedAppointments: [],
                summary: {
                    totalAppointmentsSuggested: 0,
                    schedulingConflicts: [],
                    recommendations: []
                }
            };

            const result = conflictChecker.checkConflicts(mockPractitionerAvailability, emptySuggestions);

            expect(result.conflictedAppointments).toHaveLength(0);
            expect(result.validAppointments).toHaveLength(0);
            expect(result.summary.totalConflicted).toBe(0);
            expect(result.summary.totalValid).toBe(0);
        });

        test('should handle practitioner availability with no free slots', () => {
            const noAvailability = {
                practitionerId: 46932,
                dateRange: {
                    start: "2025-08-01T00:00:00",
                    end: "2025-08-31T23:59:59"
                },
                freeTimeSlots: []
            };

            const suggestedAppointments = {
                suggestedAppointments: [
                    {
                        start: "2025-08-26T01:00:00Z",
                        end: "2025-08-26T02:40:00Z",
                        serviceId: 101,
                        locationId: 19042,
                        practitionerId: 46932,
                        patientId: 12345,
                        caseId: 67890,
                        note: "Test appointment",
                        appointmentIndex: 0
                    }
                ],
                summary: {
                    totalAppointmentsSuggested: 1,
                    schedulingConflicts: [],
                    recommendations: []
                }
            };

            const result = conflictChecker.checkConflicts(noAvailability, suggestedAppointments);

            expect(result.conflictedAppointments).toHaveLength(1);
            expect(result.conflictedAppointments[0].conflicts).toContain('No available time slot found for this appointment');
        });

        test('should handle invalid date formats gracefully', () => {
            const suggestedAppointments = {
                suggestedAppointments: [
                    {
                        start: "invalid-date",
                        end: "2025-08-26T02:40:00Z",
                        serviceId: 101,
                        locationId: 19042,
                        practitionerId: 46932,
                        patientId: 12345,
                        caseId: 67890,
                        note: "Invalid date test",
                        appointmentIndex: 0
                    }
                ],
                summary: {
                    totalAppointmentsSuggested: 1,
                    schedulingConflicts: [],
                    recommendations: []
                }
            };

            const result = conflictChecker.checkConflicts(mockPractitionerAvailability, suggestedAppointments);
            
            expect(result.conflictedAppointments).toHaveLength(1);
            expect(result.conflictedAppointments[0].conflicts).toContain('Invalid appointment start or end time format');
        });
    });
});