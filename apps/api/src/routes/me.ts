import { Router } from 'express';

export const meRouter = Router();

meRouter.get('/', (request, response) => {
  response.json({
    data: {
      id: request.user!.id,
      email: request.user!.email,
      role: request.user!.role
    },
    requestId: request.requestId
  });
});
