import { fromZonedTime, formatInTimeZone, getTimezoneOffset as getTimezoneOffsetFns, toZonedTime } from 'date-fns-tz';
import { parseISO, getHours, format } from 'date-fns';

/**
 * Timezone utility functions for the HHG Calvin-2 scheduling system
 * Consolidates duplicate timezone conversion logic from multiple files
 */

/**
 * Constants for consistent locale handling
 */
export const DEFAULT_LOCALE = 'en-AU'; // Australian English for healthcare context
export const DEFAULT_TIMEZONE = 'Australia/Melbourne';

/**
 * Get timezone abbreviation for display purposes
 * @param {string} timezone - Timezone identifier (e.g., 'Australia/Melbourne')
 * @returns {string} Timezone abbreviation (e.g., 'AEST/AEDT')
 */
export function getTimezoneAbbr(timezone) {
    // Handle null/undefined inputs
    if (!timezone) return '';
    
    // Comprehensive mapping for all Australian timezones based on official IANA data
    const timezoneMap = {
        // Eastern Standard/Daylight Time (AEST/AEDT) - UTC+10/+11
        'Australia/Melbourne': 'AEST/AEDT',
        'Australia/Sydney': 'AEST/AEDT',
        'Australia/Hobart': 'AEST/AEDT',
        'Australia/ACT': 'AEST/AEDT',
        'Australia/Canberra': 'AEST/AEDT',
        'Australia/Currie': 'AEST/AEDT',
        'Australia/NSW': 'AEST/AEDT',
        'Australia/Tasmania': 'AEST/AEDT',
        'Australia/Victoria': 'AEST/AEDT',
        
        // Eastern Standard Time only (AEST) - UTC+10 (no DST)
        'Australia/Brisbane': 'AEST',
        'Australia/Lindeman': 'AEST',
        'Australia/Queensland': 'AEST',
        
        // Central Standard/Daylight Time (ACST/ACDT) - UTC+9:30/+10:30
        'Australia/Adelaide': 'ACST/ACDT',
        'Australia/Broken_Hill': 'ACST/ACDT',
        'Australia/South': 'ACST/ACDT',
        'Australia/Yancowinna': 'ACST/ACDT',
        
        // Central Standard Time only (ACST) - UTC+9:30 (no DST)
        'Australia/Darwin': 'ACST',
        'Australia/North': 'ACST',
        
        // Western Standard Time (AWST) - UTC+8 (no DST)
        'Australia/Perth': 'AWST',
        'Australia/West': 'AWST',
        
        // Unique timezones
        'Australia/Eucla': 'ACWST',     // Central Western Standard Time UTC+8:45
        'Australia/Lord_Howe': 'LHST/LHDT', // Lord Howe Standard/Daylight Time UTC+10:30/+11
        'Australia/LHI': 'LHST/LHDT'    // Link to Lord_Howe
    };
    return timezoneMap[timezone] || timezone.split('/')[1] || timezone;
}

/**
 * Get time of day range that spans from start to end time
 * @param {Date} startUTC - UTC start date
 * @param {Date} endUTC - UTC end date  
 * @param {string} timezone - Timezone identifier
 * @returns {string} Time range category (e.g., 'morning', 'morning-afternoon', 'afternoon-evening')
 */
export function getTimeOfDayRange(startUTC, endUTC, timezone) {
    // Convert UTC dates to local time in the specified timezone
    const startLocal = toZonedTime(startUTC, timezone);
    const endLocal = toZonedTime(endUTC, timezone);
    
    const startHour = getHours(startLocal);
    const endHour = getHours(endLocal);
    
    // Define time periods: morning (0-11), afternoon (12-16), evening (17-23)
    const getTimePeriod = (hour) => {
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        return 'evening';
    };
    
    const startPeriod = getTimePeriod(startHour);
    const endPeriod = getTimePeriod(endHour);
    
    // If same period, return single period
    if (startPeriod === endPeriod) {
        return startPeriod;
    }
    
    // Handle cross-day appointments (rare but possible)
    if (endHour < startHour) {
        // Spans to next day - just return the start period for simplicity
        return startPeriod;
    }
    
    // Determine spanning periods
    const periods = [];
    if (startHour < 12 && endHour >= 12) periods.push('morning');
    if (startHour < 17 && endHour >= 12) periods.push('afternoon');  
    if (endHour >= 17) periods.push('evening');
    
    return periods.join('-');
}

/**
 * Get simple time of day category for a single UTC date
 * @param {Date} utcDate - UTC date
 * @param {string} timezone - Timezone identifier
 * @returns {string} Time of day ('morning', 'afternoon', 'evening')
 */
export function getTimeOfDay(utcDate, timezone) {
    // Convert UTC date to local time in the specified timezone
    // date-fns functions will throw on invalid dates naturally
    const localDate = toZonedTime(utcDate, timezone);
    const localHour = getHours(localDate);
    
    if (localHour < 12) return 'morning';
    if (localHour < 17) return 'afternoon';
    return 'evening';
}

/**
 * Convert local time string to UTC ISO format
 * @param {string} localTimeString - Local time string in ISO format
 * @param {string} timezone - Timezone identifier
 * @returns {string} UTC time in ISO format
 */
export function convertLocalToUTC(localTimeString, timezone) {
    // Parse the local time string and convert it to UTC
    // The localTimeString represents a time in the specified timezone
    const localDate = parseISO(localTimeString);
    const utcDate = fromZonedTime(localDate, timezone);
    return utcDate.toISOString();
}

/**
 * Convert UTC date to local time string using simple JavaScript method
 * @param {Date} utcDate - UTC date object
 * @param {string} timezone - Timezone identifier  
 * @returns {Date} Local time as Date object
 */
export function convertUTCToLocal(utcDate, timezone) {
    // Use date-fns-tz built-in function for reliable timezone conversion
    return toZonedTime(utcDate, timezone);
}

/**
 * Format UTC date in local timezone with full context
 * @param {Date} utcDate - UTC date object
 * @param {string} timezone - Timezone identifier
 * @returns {string} Formatted local time string with timezone abbreviation
 */
export function formatLocalTime(utcDate, timezone) {
    // Use date-fns-tz formatInTimeZone for cleaner formatting
    const formattedDate = formatInTimeZone(utcDate, timezone, 'EEEE d MMMM yyyy \'at\' h:mm a');
    const timezoneName = getTimezoneAbbr(timezone);
    return `${formattedDate} ${timezoneName}`;
}

/**
 * Get day of week in local timezone
 * @param {Date} utcDate - UTC date object
 * @param {string} timezone - Timezone identifier
 * @returns {string} Day of week (e.g., 'Monday')
 */
export function getDayOfWeek(utcDate, timezone) {
    // Use date-fns format with timezone conversion
    // date-fns functions will throw on invalid dates naturally
    const localDate = toZonedTime(utcDate, timezone);
    return format(localDate, 'EEEE'); // Full day name (e.g., 'Monday')
}

/**
 * Convert availability data from UTC to local time for LLM consumption
 * @param {Object} availability - Availability data with UTC timestamps
 * @returns {Object} Availability data with local time timestamps
 */
export function convertAvailabilityToLocalTime(availability) {
    const practitionerTimezone = availability.practitionerTimezone;
    
    return {
        ...availability,
        note: `All times are in ${practitionerTimezone} local time. When suggesting appointments, provide times in this local timezone.`,
        freeTimeSlots: availability.freeTimeSlots.map(slot => {
            const startUTC = new Date(slot.startDateTime);
            const endUTC = new Date(slot.endDateTime);
            
            // Convert to local time string in ISO-like format for LLM clarity
            const localStart = formatInTimeZone(startUTC, practitionerTimezone, 'yyyy-MM-dd HH:mm:ss');
            const localEnd = formatInTimeZone(endUTC, practitionerTimezone, 'yyyy-MM-dd HH:mm:ss');
            
            // Get day and time context in local timezone
            const dayOfWeek = getDayOfWeek(startUTC, practitionerTimezone);
            const timeOfDay = getTimeOfDayRange(startUTC, endUTC, practitionerTimezone);
            
            return {
                startDateTime: localStart,
                endDateTime: localEnd,
                duration: slot.duration,
                locationId: slot.locationId,
                dayOfWeek: dayOfWeek,
                timeOfDay: timeOfDay
            };
        })
    };
}

/**
 * Get timezone offset in minutes for a given timezone and date
 * @param {string} timezone - Timezone identifier
 * @param {Date} date - Date to check offset for
 * @returns {number} Offset in minutes
 */
export function getTimezoneOffset(timezone, date) {
    // Use date-fns-tz built-in function which handles DST transitions correctly
    // Returns offset in milliseconds, convert to minutes for consistency with legacy code
    return getTimezoneOffsetFns(timezone, date) / (1000 * 60);
}

