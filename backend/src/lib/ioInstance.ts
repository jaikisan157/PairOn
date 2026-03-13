import type { Server } from 'socket.io';

// Singleton to share Socket.io instance across routes & services
let _io: Server | null = null;

export function setIo(io: Server) {
    _io = io;
}

export function getIo(): Server | null {
    return _io;
}
