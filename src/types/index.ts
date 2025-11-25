// src/types.ts
// This type represents the data stored on the WebSocket connection,
// such as the id of the connected user.
export interface WebSocketData {
    id: string;
}

// This type is used for validating and typing the incoming WebSocket messages.
// It ensures that each message has a `message` property of type string.
export interface MessageBody {
    message: string;
}

// This type represents the expected structure of the query parameters
// used during the WebSocket connection upgrade, particularly the JWT token.
export interface QueryParams {
    token: string;
}
