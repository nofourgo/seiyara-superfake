import { Elysia } from 'elysia';

export const healthRoutes = (app: Elysia) => {
    app.get('/api/healthcheck', () => {
        return {
            status: 'OK!',
        };
    });
};
