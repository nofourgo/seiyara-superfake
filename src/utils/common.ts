import mongoose from 'mongoose';
import logger from '../utils/logger';

export const handleError = (error: unknown, request?: any, body?: any): Response => {
    if (request && request.headers) {
        (request as Request).headers.delete('authorization');
    }
    logger.error({
        message: (error as Error).message,
        stack: (error as Error).stack,
        context: {
            method: request?.method,
            url: request?.url,
            headers: request?.headers,
            user: request?.user,
            body: body,
        }
    });

    let msg: string;
    let status: number;

    if (error instanceof mongoose.Error) {
        msg = 'Internal error';
        status = 500;
    } else if (error instanceof Error) {
        msg = error.message;
        status = 400;
    } else {
        msg = 'Unknown error';
        status = 500;
    }

    return new Response(JSON.stringify({ message: msg }), { status: status, headers: { 'Content-Type': 'application/json' } });
};

export const getRandomInRange = (min: number, max: number): number => {
    return min + Math.random() * (max - min);
};

export const isNextDayOfGivenDate = (givenDate: Date | null): boolean => {
    if (!givenDate) {
        return true;
    }

    const today = new Date(); // Get today's date

    // Add one day to the given date
    const nextDay = new Date(givenDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Clear the time part (hours, minutes, seconds) for comparison
    nextDay.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    // Compare the adjusted next day with today
    return nextDay.getTime() === today.getTime();
};

export const isBeforeToday = (givenDate: Date | null): boolean => {
    if (!givenDate) {
        return true;
    }

    const today = new Date(); // Get today's date
    today.setUTCHours(0, 0, 0, 0); // Set the time to midnight (start of the day)

    return givenDate.getTime() < today.getTime();
};

export const getWeekIndex = (currentDate: Date): string => {
    // Adjust to get the most recent Monday
    const dayOfWeek = (currentDate.getDay() + 6) % 7; // Monday = 0, Sunday = 6
    const latestMonday = new Date(currentDate);
    latestMonday.setDate(currentDate.getDate() - dayOfWeek);

    // Format date as YYYYMMDD
    const year = latestMonday.getFullYear();
    const month = (latestMonday.getMonth() + 1).toString().padStart(2, '0'); // Months are zero-indexed
    const day = latestMonday.getDate().toString().padStart(2, '0');

    return `${year}${month}${day}`;
};

export const getTodayTimeEnd = (today: Date): Date => {
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    return todayEnd;
};

export const formatDurationMs = (milliseconds: number): string => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    const remainingSeconds = seconds % 60;
    const remainingMinutes = minutes % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0) parts.push(`${remainingMinutes}m`);
    parts.push(`${remainingSeconds}s`);

    return parts.join(':');
};
