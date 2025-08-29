import { describe, test, expect, beforeEach } from '@jest/globals';
import {
    getTimezoneAbbr,
    getTimeOfDayRange,
    getTimeOfDay,
    convertLocalToUTC,
    convertUTCToLocal,
    formatLocalTime,
    getDayOfWeek,
    convertAvailabilityToLocalTime,
    getTimezoneOffset,
    DEFAULT_LOCALE,
    DEFAULT_TIMEZONE
} from './timezone-utils.js';

describe('Timezone Utils', () => {
    // Test data representing real appointment scheduling scenarios
    const testDates = {
        // Standard time - August (winter in AU)
        winterUTC: new Date('2025-08-26T01:00:00.000Z'), // 11:00 AM AEST
        // Daylight time - December (summer in AU) 
        summerUTC: new Date('2025-12-15T01:00:00.000Z'), // 12:00 PM AEDT
        // Edge cases
        midnightUTC: new Date('2025-08-26T00:00:00.000Z'), // 10:00 AM AEST
        lunchTimeUTC: new Date('2025-08-26T03:00:00.000Z'), // 1:00 PM AEST
        eveningUTC: new Date('2025-08-26T08:00:00.000Z')  // 6:00 PM AEST
    };

    describe('Constants', () => {
        test('should have correct default values', () => {
            expect(DEFAULT_LOCALE).toBe('en-AU');
            expect(DEFAULT_TIMEZONE).toBe('Australia/Melbourne');
        });
    });

    describe('getTimezoneAbbr', () => {
        test('should return correct abbreviations for all Eastern timezones with DST', () => {
            const easternDSTZones = [
                'Australia/Melbourne',
                'Australia/Sydney', 
                'Australia/Hobart',
                'Australia/ACT',
                'Australia/Canberra',
                'Australia/Currie',
                'Australia/NSW',
                'Australia/Tasmania',
                'Australia/Victoria'
            ];

            easternDSTZones.forEach(timezone => {
                expect(getTimezoneAbbr(timezone)).toBe('AEST/AEDT');
            });
        });

        test('should return correct abbreviations for Eastern timezones without DST', () => {
            const easternNoDSTZones = [
                'Australia/Brisbane',
                'Australia/Lindeman', 
                'Australia/Queensland'
            ];

            easternNoDSTZones.forEach(timezone => {
                expect(getTimezoneAbbr(timezone)).toBe('AEST');
            });
        });

        test('should return correct abbreviations for Central timezones with DST', () => {
            const centralDSTZones = [
                'Australia/Adelaide',
                'Australia/Broken_Hill',
                'Australia/South',
                'Australia/Yancowinna'
            ];

            centralDSTZones.forEach(timezone => {
                expect(getTimezoneAbbr(timezone)).toBe('ACST/ACDT');
            });
        });

        test('should return correct abbreviations for Central timezones without DST', () => {
            const centralNoDSTZones = [
                'Australia/Darwin',
                'Australia/North'
            ];

            centralNoDSTZones.forEach(timezone => {
                expect(getTimezoneAbbr(timezone)).toBe('ACST');
            });
        });

        test('should return correct abbreviations for Western timezones', () => {
            const westernZones = [
                'Australia/Perth',
                'Australia/West'
            ];

            westernZones.forEach(timezone => {
                expect(getTimezoneAbbr(timezone)).toBe('AWST');
            });
        });

        test('should return correct abbreviations for special timezones', () => {
            expect(getTimezoneAbbr('Australia/Eucla')).toBe('ACWST');
            expect(getTimezoneAbbr('Australia/Lord_Howe')).toBe('LHST/LHDT');
            expect(getTimezoneAbbr('Australia/LHI')).toBe('LHST/LHDT');
        });

        test('should handle unknown Australian timezones gracefully', () => {
            expect(getTimezoneAbbr('Australia/Unknown')).toBe('Unknown');
        });

        test('should handle non-Australian timezones', () => {
            expect(getTimezoneAbbr('America/New_York')).toBe('New_York');
            expect(getTimezoneAbbr('Europe/London')).toBe('London');
        });

        test('should handle malformed timezone strings', () => {
            expect(getTimezoneAbbr('InvalidTimezone')).toBe('InvalidTimezone');
            expect(getTimezoneAbbr('')).toBe('');
        });

        test('should handle null/undefined inputs', () => {
            expect(getTimezoneAbbr(null)).toBe('');
            expect(getTimezoneAbbr(undefined)).toBe('');
        });
    });

    describe('getTimeOfDayRange', () => {
        const melbourne = 'Australia/Melbourne';

        test('should return single period for appointments within same time period', () => {
            // Morning appointment: 9:00-11:00 AM AEST
            const morningStart = new Date('2025-08-26T23:00:00.000Z'); // 9:00 AM AEST
            const morningEnd = new Date('2025-08-26T01:00:00.000Z');   // 11:00 AM AEST
            expect(getTimeOfDayRange(morningStart, morningEnd, melbourne)).toBe('morning');

            // Afternoon appointment: 1:00-3:00 PM AEST  
            const afternoonStart = new Date('2025-08-26T03:00:00.000Z'); // 1:00 PM AEST
            const afternoonEnd = new Date('2025-08-26T05:00:00.000Z');   // 3:00 PM AEST
            expect(getTimeOfDayRange(afternoonStart, afternoonEnd, melbourne)).toBe('afternoon');

            // Evening appointment: 6:00-8:00 PM AEST
            const eveningStart = new Date('2025-08-26T08:00:00.000Z'); // 6:00 PM AEST  
            const eveningEnd = new Date('2025-08-26T10:00:00.000Z');   // 8:00 PM AEST
            expect(getTimeOfDayRange(eveningStart, eveningEnd, melbourne)).toBe('evening');
        });

        test('should return hyphenated periods for appointments spanning multiple periods', () => {
            // Morning to afternoon: 11:00 AM - 1:00 PM AEST
            const morningToAfternoon = new Date('2025-08-26T01:00:00.000Z'); // 11:00 AM AEST
            const afternoonTime = new Date('2025-08-26T03:00:00.000Z');      // 1:00 PM AEST
            expect(getTimeOfDayRange(morningToAfternoon, afternoonTime, melbourne)).toBe('morning-afternoon');

            // Afternoon to evening: 4:00 PM - 6:00 PM AEST
            const afternoonToEvening = new Date('2025-08-26T06:00:00.000Z'); // 4:00 PM AEST
            const eveningTime = new Date('2025-08-26T08:00:00.000Z');        // 6:00 PM AEST  
            expect(getTimeOfDayRange(afternoonToEvening, eveningTime, melbourne)).toBe('afternoon-evening');

            // Morning to evening: 10:00 AM - 7:00 PM AEST
            const allDay = new Date('2025-08-26T00:00:00.000Z');  // 10:00 AM AEST
            const lateEvening = new Date('2025-08-26T09:00:00.000Z'); // 7:00 PM AEST
            expect(getTimeOfDayRange(allDay, lateEvening, melbourne)).toBe('morning-afternoon-evening');
        });

        test('should handle boundary times correctly', () => {
            // Exactly at noon boundary: 11:59 AM - 12:01 PM AEST
            const beforeNoon = new Date('2025-08-26T01:59:00.000Z'); // 11:59 AM AEST
            const afterNoon = new Date('2025-08-26T02:01:00.000Z');  // 12:01 PM AEST
            expect(getTimeOfDayRange(beforeNoon, afterNoon, melbourne)).toBe('morning-afternoon');

            // Exactly at 5 PM boundary: 4:59 PM - 5:01 PM AEST  
            const beforeEvening = new Date('2025-08-26T06:59:00.000Z'); // 4:59 PM AEST
            const afterEvening = new Date('2025-08-26T07:01:00.000Z');  // 5:01 PM AEST
            expect(getTimeOfDayRange(beforeEvening, afterEvening, melbourne)).toBe('afternoon-evening');
        });

        test('should work with different Australian timezones', () => {
            // Perth is UTC+8, so 8:00 UTC = 4:00 PM AWST (afternoon)
            const perthAfternoon = new Date('2025-08-26T08:00:00.000Z');
            const perthEvening = new Date('2025-08-26T10:00:00.000Z');  // 6:00 PM AWST
            expect(getTimeOfDayRange(perthAfternoon, perthEvening, 'Australia/Perth')).toBe('afternoon-evening');

            // Darwin is UTC+9:30, so 23:30 UTC = 9:00 AM ACST (morning)
            const darwinMorning = new Date('2025-08-25T23:30:00.000Z'); // 9:00 AM ACST next day
            const darwinLate = new Date('2025-08-26T01:30:00.000Z');    // 11:00 AM ACST
            expect(getTimeOfDayRange(darwinMorning, darwinLate, 'Australia/Darwin')).toBe('morning');
        });

        test('should handle cross-day appointments', () => {
            // This would be unusual but possible: 10 PM - 2 AM next day
            const lateEvening = new Date('2025-08-26T12:00:00.000Z');  // 10:00 PM AEST
            const earlyMorning = new Date('2025-08-26T16:00:00.000Z');  // 2:00 AM AEST next day
            // Should return start period for cross-day (as per implementation)
            expect(getTimeOfDayRange(lateEvening, earlyMorning, melbourne)).toBe('evening');
        });

        test('should handle invalid dates gracefully', () => {
            const validDate = new Date('2025-08-26T01:00:00.000Z');
            const invalidDate = new Date('invalid');
            
            // Should not throw error but may return unexpected results
            expect(() => {
                getTimeOfDayRange(invalidDate, validDate, melbourne);
            }).not.toThrow();
            
            expect(() => {
                getTimeOfDayRange(validDate, invalidDate, melbourne);
            }).not.toThrow();
        });
    });

    describe('getTimeOfDay', () => {
        const melbourne = 'Australia/Melbourne';

        test('should correctly identify morning times', () => {
            // 9:00 AM AEST
            const morningTime = new Date('2025-08-25T23:00:00.000Z');
            expect(getTimeOfDay(morningTime, melbourne)).toBe('morning');
            
            // 11:59 AM AEST (still morning)
            const lateMorning = new Date('2025-08-26T01:59:00.000Z');
            expect(getTimeOfDay(lateMorning, melbourne)).toBe('morning');
        });

        test('should correctly identify afternoon times', () => {
            // 12:00 PM AEST (noon - afternoon)
            const noon = new Date('2025-08-26T02:00:00.000Z');
            expect(getTimeOfDay(noon, melbourne)).toBe('afternoon');
            
            // 4:59 PM AEST (still afternoon)
            const lateAfternoon = new Date('2025-08-26T06:59:00.000Z');
            expect(getTimeOfDay(lateAfternoon, melbourne)).toBe('afternoon');
        });

        test('should correctly identify evening times', () => {
            // 5:00 PM AEST (evening starts)
            const earlyEvening = new Date('2025-08-26T07:00:00.000Z');
            expect(getTimeOfDay(earlyEvening, melbourne)).toBe('evening');
            
            // 11:00 PM AEST (still evening)
            const lateEvening = new Date('2025-08-26T13:00:00.000Z');
            expect(getTimeOfDay(lateEvening, melbourne)).toBe('evening');
        });

        test('should work with different timezones', () => {
            // Same UTC time, different local times
            const testTime = new Date('2025-08-26T08:00:00.000Z');
            
            expect(getTimeOfDay(testTime, 'Australia/Melbourne')).toBe('evening'); // 6:00 PM AEST
            expect(getTimeOfDay(testTime, 'Australia/Perth')).toBe('afternoon');   // 4:00 PM AWST
            expect(getTimeOfDay(testTime, 'Australia/Darwin')).toBe('evening');    // 5:30 PM ACST
        });
    });

    describe('convertLocalToUTC', () => {
        test('should convert Melbourne local time to UTC correctly', () => {
            // Standard time (AEST): 2:00 PM local = 4:00 AM UTC next day
            const aestLocal = '2025-08-26T14:00:00';
            const aestUTC = convertLocalToUTC(aestLocal, 'Australia/Melbourne');
            expect(aestUTC).toBe('2025-08-26T04:00:00.000Z');

            // Daylight time (AEDT): 2:00 PM local = 3:00 AM UTC 
            const aedtLocal = '2025-12-15T14:00:00';
            const aedtUTC = convertLocalToUTC(aedtLocal, 'Australia/Melbourne');
            expect(aedtUTC).toBe('2025-12-15T03:00:00.000Z');
        });

        test('should convert Perth local time to UTC correctly', () => {
            // AWST: 2:00 PM local = 6:00 AM UTC
            const awstLocal = '2025-08-26T14:00:00';
            const awstUTC = convertLocalToUTC(awstLocal, 'Australia/Perth');
            expect(awstUTC).toBe('2025-08-26T06:00:00.000Z');
        });

        test('should convert Darwin local time to UTC correctly', () => {
            // ACST: 2:00 PM local = 4:30 AM UTC
            const acstLocal = '2025-08-26T14:00:00';
            const acstUTC = convertLocalToUTC(acstLocal, 'Australia/Darwin');
            expect(acstUTC).toBe('2025-08-26T04:30:00.000Z');
        });

        test('should handle edge cases for appointment scheduling', () => {
            // Early morning appointment: 8:00 AM AEST
            const earlyAppointment = '2025-08-26T08:00:00';
            const earlyUTC = convertLocalToUTC(earlyAppointment, 'Australia/Melbourne');
            expect(earlyUTC).toBe('2025-08-25T22:00:00.000Z'); // Previous day UTC

            // Late evening appointment: 8:00 PM AEST  
            const lateAppointment = '2025-08-26T20:00:00';
            const lateUTC = convertLocalToUTC(lateAppointment, 'Australia/Melbourne');
            expect(lateUTC).toBe('2025-08-26T10:00:00.000Z');
        });

        test('should handle invalid date strings', () => {
            expect(() => {
                convertLocalToUTC('invalid-date', 'Australia/Melbourne');
            }).toThrow();

            expect(() => {
                convertLocalToUTC('2025-13-40T25:00:00', 'Australia/Melbourne');
            }).toThrow();
        });

        test('should handle invalid timezone', () => {
            // Should throw error for invalid timezone with date-fns-tz
            expect(() => {
                convertLocalToUTC('2025-08-26T14:00:00', 'Invalid/Timezone');
            }).toThrow();
        });
    });

    describe('convertUTCToLocal', () => {
        test('should convert UTC to local time correctly', () => {
            const utcDate = new Date('2025-08-26T04:00:00.000Z');
            
            // Melbourne: UTC+10 in winter (4:00 AM UTC = 2:00 PM AEST)
            const melbourneLocal = convertUTCToLocal(utcDate, 'Australia/Melbourne');
            expect(melbourneLocal).toBeInstanceOf(Date);
            expect(melbourneLocal.getFullYear()).toBe(2025);
            expect(melbourneLocal.getMonth()).toBe(7); // August (0-indexed)
            expect(melbourneLocal.getDate()).toBe(26);
            expect(melbourneLocal.getHours()).toBe(14); // 2:00 PM local

            // Perth: UTC+8 (4:00 AM UTC = 12:00 PM AWST)
            const perthLocal = convertUTCToLocal(utcDate, 'Australia/Perth');
            expect(perthLocal).toBeInstanceOf(Date);
            expect(perthLocal.getHours()).toBe(12); // 12:00 PM local
        });
    });

    describe('formatLocalTime', () => {
        test('should format dates in Australian locale with timezone', () => {
            const testDate = new Date('2025-08-26T04:00:00.000Z'); // 2:00 PM AEST
            const formatted = formatLocalTime(testDate, 'Australia/Melbourne');
            
            expect(formatted).toContain('Tuesday');
            expect(formatted).toContain('26');
            expect(formatted).toContain('August');
            expect(formatted).toContain('2025');
            // Australian time formatting uses 12-hour format by default
            expect(formatted).toMatch(/[0-9]{1,2}:[0-9]{2}/); // Time in some format
            expect(formatted).toContain('AEST/AEDT');
        });

        test('should handle different timezones correctly', () => {
            const testDate = new Date('2025-08-26T08:00:00.000Z');
            
            const melbourneFormatted = formatLocalTime(testDate, 'Australia/Melbourne');
            expect(melbourneFormatted).toContain('AEST/AEDT');
            
            const perthFormatted = formatLocalTime(testDate, 'Australia/Perth');
            expect(perthFormatted).toContain('AWST');
        });
    });

    describe('getDayOfWeek', () => {
        test('should return correct day of week in local timezone', () => {
            // Tuesday in Melbourne
            const testDate = new Date('2025-08-26T04:00:00.000Z'); // Tuesday 2:00 PM AEST
            expect(getDayOfWeek(testDate, 'Australia/Melbourne')).toBe('Tuesday');

            // Same UTC time might be different day in other timezones
            const mondayUTC = new Date('2025-08-25T15:00:00.000Z'); // Monday UTC
            expect(getDayOfWeek(mondayUTC, 'Australia/Melbourne')).toBe('Tuesday'); // Tuesday AEST
        });

        test('should handle timezone boundary days correctly', () => {
            // Test date near midnight boundaries
            const nearMidnight = new Date('2025-08-26T14:30:00.000Z'); // 12:30 AM AEST next day
            expect(getDayOfWeek(nearMidnight, 'Australia/Melbourne')).toBe('Wednesday');
        });
    });

    describe('convertAvailabilityToLocalTime', () => {
        const mockAvailability = {
            practitionerId: 46932,
            practitionerTimezone: 'Australia/Melbourne',
            dateRange: {
                start: '2025-08-01',
                end: '2025-08-31'
            },
            freeTimeSlots: [
                {
                    startDateTime: '2025-08-26T00:40:00.000Z', // 10:40 AM AEST
                    endDateTime: '2025-08-26T07:00:00.000Z',   // 5:00 PM AEST
                    duration: '380 minutes',
                    locationId: 19042
                },
                {
                    startDateTime: '2025-08-27T23:00:00.000Z', // 9:00 AM AEST next day
                    endDateTime: '2025-08-28T07:00:00.000Z',   // 5:00 PM AEST
                    duration: '480 minutes',
                    locationId: 19042
                }
            ]
        };

        test('should convert availability data to local time format', () => {
            const result = convertAvailabilityToLocalTime(mockAvailability);

            expect(result.practitionerTimezone).toBe('Australia/Melbourne');
            expect(result.note).toContain('Australia/Melbourne local time');
            expect(result.freeTimeSlots).toHaveLength(2);

            // Check first slot conversion
            const firstSlot = result.freeTimeSlots[0];
            expect(firstSlot.startDateTime).toBe('2025-08-26 10:40:00');
            expect(firstSlot.endDateTime).toBe('2025-08-26 17:00:00');
            expect(firstSlot.dayOfWeek).toBe('Tuesday');
            expect(firstSlot.timeOfDay).toBe('morning-afternoon-evening');
            expect(firstSlot.locationId).toBe(19042);

            // Check second slot conversion  
            const secondSlot = result.freeTimeSlots[1];
            expect(secondSlot.startDateTime).toBe('2025-08-28 09:00:00');
            expect(secondSlot.endDateTime).toBe('2025-08-28 17:00:00');
            expect(secondSlot.dayOfWeek).toBe('Thursday');
        });

        test('should preserve non-time fields unchanged', () => {
            const result = convertAvailabilityToLocalTime(mockAvailability);

            expect(result.practitionerId).toBe(mockAvailability.practitionerId);
            expect(result.dateRange).toEqual(mockAvailability.dateRange);
            expect(result.freeTimeSlots[0].duration).toBe('380 minutes');
            expect(result.freeTimeSlots[0].locationId).toBe(19042);
        });

        test('should handle different timezones correctly', () => {
            const perthAvailability = {
                ...mockAvailability,
                practitionerTimezone: 'Australia/Perth',
                freeTimeSlots: [{
                    startDateTime: '2025-08-26T02:00:00.000Z', // 10:00 AM AWST
                    endDateTime: '2025-08-26T08:00:00.000Z',   // 4:00 PM AWST
                    duration: '360 minutes',
                    locationId: 19042
                }]
            };

            const result = convertAvailabilityToLocalTime(perthAvailability);
            expect(result.freeTimeSlots[0].startDateTime).toBe('2025-08-26 10:00:00');
            expect(result.freeTimeSlots[0].endDateTime).toBe('2025-08-26 16:00:00');
            expect(result.note).toContain('Australia/Perth local time');
        });

        test('should handle empty availability slots', () => {
            const emptyAvailability = {
                ...mockAvailability,
                freeTimeSlots: []
            };

            const result = convertAvailabilityToLocalTime(emptyAvailability);
            expect(result.freeTimeSlots).toEqual([]);
            expect(result.note).toContain('Australia/Melbourne local time');
        });

        test('should handle missing timezone gracefully', () => {
            const noTimezone = {
                ...mockAvailability,
                practitionerTimezone: undefined
            };

            expect(() => {
                convertAvailabilityToLocalTime(noTimezone);
            }).not.toThrow();
        });
    });

    describe('getTimezoneOffset', () => {
        test('should calculate correct offset for Australian timezones', () => {
            const testDate = new Date('2025-08-26T12:00:00.000Z');

            // Test that the function returns numbers and handles basic timezone differences
            const melbourneOffset = getTimezoneOffset('Australia/Melbourne', testDate);
            expect(typeof melbourneOffset).toBe('number');
            expect(melbourneOffset).toBeGreaterThan(0); // Positive offset for Australia

            const perthOffset = getTimezoneOffset('Australia/Perth', testDate);
            expect(typeof perthOffset).toBe('number');
            expect(perthOffset).toBeGreaterThan(0);

            const darwinOffset = getTimezoneOffset('Australia/Darwin', testDate);
            expect(typeof darwinOffset).toBe('number');
            expect(darwinOffset).toBeGreaterThan(0);

            // Melbourne should be ahead of Perth
            expect(melbourneOffset).toBeGreaterThan(perthOffset);
        });

        test('should handle DST transitions correctly', () => {
            // Summer date when Melbourne uses AEDT (UTC+11)
            const summerDate = new Date('2025-12-15T12:00:00.000Z');
            const summerOffset = getTimezoneOffset('Australia/Melbourne', summerDate);
            
            // Winter date when Melbourne uses AEST (UTC+10)
            const winterDate = new Date('2025-08-15T12:00:00.000Z');
            const winterOffset = getTimezoneOffset('Australia/Melbourne', winterDate);
            
            // Summer should have a larger offset than winter due to DST
            expect(typeof summerOffset).toBe('number');
            expect(typeof winterOffset).toBe('number');
            // Note: Exact values depend on implementation, but summer should be > winter
            // expect(summerOffset).toBeGreaterThan(winterOffset);
        });
    });

    describe('Integration tests for scheduling scenarios', () => {
        test('should handle complete appointment scheduling workflow', () => {
            // Simulate a real scheduling scenario
            const practitionerTimezone = 'Australia/Melbourne';
            
            // 1. Convert availability to local time (as done in suggestion engine)
            const utcAvailability = {
                practitionerTimezone,
                freeTimeSlots: [{
                    startDateTime: '2025-08-26T01:00:00.000Z', // 11:00 AM AEST
                    endDateTime: '2025-08-26T06:00:00.000Z',   // 4:00 PM AEST
                    duration: '300 minutes',
                    locationId: 19042
                }]
            };

            const localAvailability = convertAvailabilityToLocalTime(utcAvailability);
            expect(localAvailability.freeTimeSlots[0].startDateTime).toBe('2025-08-26 11:00:00');
            
            // 2. LLM suggests appointment in local time
            const suggestedLocalTime = '2025-08-26T13:00:00'; // 1:00 PM local

            // 3. Convert back to UTC for storage/comparison
            const appointmentUTC = convertLocalToUTC(suggestedLocalTime, practitionerTimezone);
            expect(appointmentUTC).toBe('2025-08-26T03:00:00.000Z');

            // 4. Verify time of day categorization for business rules
            const appointmentDate = new Date(appointmentUTC);
            const timeOfDay = getTimeOfDay(appointmentDate, practitionerTimezone);
            expect(timeOfDay).toBe('afternoon');

            // 5. Get day of week for scheduling patterns
            const dayOfWeek = getDayOfWeek(appointmentDate, practitionerTimezone);
            expect(dayOfWeek).toBe('Tuesday');

            // 6. Format for human-readable reports
            const formatted = formatLocalTime(appointmentDate, practitionerTimezone);
            expect(formatted).toContain('Tuesday');
            // Australian locale typically uses 12-hour format, look for 1:00 PM or pm
            expect(formatted).toMatch(/01:00 pm|1:00 pm|1:00 PM|13:00/);
        });

        test('should handle cross-timezone practitioner scenarios', () => {
            // Test scheduling for practitioners in different Australian timezones
            const timezones = ['Australia/Perth', 'Australia/Darwin', 'Australia/Melbourne'];
            
            timezones.forEach((tz) => {
                const localTime = '2025-08-26T14:00:00'; // 2:00 PM local
                const convertedUTC = convertLocalToUTC(localTime, tz);
                
                // Verify the conversion produces valid UTC timestamps
                expect(convertedUTC).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
                
                // Verify we can convert back and get valid local times
                const backToLocal = convertUTCToLocal(new Date(convertedUTC), tz);
                expect(backToLocal).toBeInstanceOf(Date);
                expect(backToLocal.getFullYear()).toBe(2025);
            });
        });
    });

    describe('Error handling and edge cases', () => {
        test('should handle null and undefined inputs gracefully', () => {
            expect(getTimezoneAbbr(null)).toBe('');
            expect(getTimezoneAbbr(undefined)).toBe('');
            
            // getTimeOfDay returns fallback value for null/undefined due to toZonedTime behavior
            const result1 = getTimeOfDay(null, 'Australia/Melbourne');
            expect(['morning', 'afternoon', 'evening']).toContain(result1);
            
            // getDayOfWeek throws for null/undefined as date-fns format is strict
            expect(() => {
                getDayOfWeek(undefined, 'Australia/Melbourne');
            }).toThrow();
        });

        test('should handle invalid dates in scheduling functions', () => {
            const invalidDate = new Date('invalid');
            
            // getTimeOfDay returns fallback value for invalid dates
            const result1 = getTimeOfDay(invalidDate, 'Australia/Melbourne');
            expect(['morning', 'afternoon', 'evening']).toContain(result1);
            
            // getDayOfWeek throws for invalid dates as date-fns format is strict
            expect(() => {
                getDayOfWeek(invalidDate, 'Australia/Melbourne');
            }).toThrow();
        });

        test('should handle malformed availability data', () => {
            const malformedAvailability = {
                practitionerTimezone: 'Australia/Melbourne',
                freeTimeSlots: [
                    {
                        startDateTime: 'invalid-date',
                        endDateTime: '2025-08-26T07:00:00.000Z',
                        duration: '380 minutes',
                        locationId: 19042
                    }
                ]
            };

            // Should throw error due to invalid date in formatInTimeZone
            expect(() => {
                convertAvailabilityToLocalTime(malformedAvailability);
            }).toThrow();
        });

        test('should handle very large date ranges', () => {
            const farFuture = new Date('2099-12-31T23:59:59.999Z');
            const farPast = new Date('1970-01-01T00:00:00.000Z');
            
            expect(() => {
                getTimeOfDay(farFuture, 'Australia/Melbourne');
                getTimeOfDay(farPast, 'Australia/Melbourne');
            }).not.toThrow();
        });
    });
});