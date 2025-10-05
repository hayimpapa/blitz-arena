'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    // Prevent duplicate socket connections in React Strict Mode
    if (socketRef.current) {
      return;
    }

    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });

    setSocket(newSocket);

    return () => {
      if (socketRef.current) {
        console.log('Cleaning up socket connection');
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}