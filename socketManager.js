// socketManager.js - Central Socket.IO management for real-time features

/**
 * Initialize Socket.IO with all real-time features
 * @param {SocketIO.Server} io - Socket.IO server instance
 */
function initializeSocketIO(io) {
  console.log("🔌 Initializing Socket.IO real-time features...");

  // Track connected clients by role
  const clients = {
    admin: new Set(),
    user: new Map(), // userId -> socketId
    anonymous: new Set(),
  };

  io.on("connection", (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);

    // Handle client registration with role
    socket.on("register", (data) => {
      const { role, userId } = data || {};

      if (role === "admin") {
        clients.admin.add(socket.id);
        socket.join("admin-room");
        console.log(`👑 Admin connected: ${socket.id}`);
      } else if (role === "user" && userId) {
        clients.user.set(userId, socket.id);
        socket.join(`user-${userId}`);
        console.log(`👤 User ${userId} connected: ${socket.id}`);
      } else {
        clients.anonymous.add(socket.id);
      }
    });

    // Disconnect handler
    socket.on("disconnect", () => {
      console.log(`❌ Client disconnected: ${socket.id}`);

      // Clean up from all tracking sets
      clients.admin.delete(socket.id);
      clients.anonymous.delete(socket.id);

      // Remove from user map
      for (const [userId, socketId] of clients.user.entries()) {
        if (socketId === socket.id) {
          clients.user.delete(userId);
          break;
        }
      }
    });
  });

  return {
    io,
    clients,

    // Emit to all admins
    emitToAdmins: (event, data) => {
      io.to("admin-room").emit(event, data);
      console.log(`📤 [ADMIN] ${event}:`, data);
    },

    // Emit to specific user
    emitToUser: (userId, event, data) => {
      io.to(`user-${userId}`).emit(event, data);
      console.log(`📤 [USER ${userId}] ${event}:`, data);
    },

    // Emit to all users
    emitToAllUsers: (event, data) => {
      // Emit to all user rooms
      clients.user.forEach((socketId, userId) => {
        io.to(`user-${userId}`).emit(event, data);
      });
      console.log(`📤 [ALL USERS] ${event}`);
    },

    // Emit to everyone (broadcast)
    emitToAll: (event, data) => {
      io.emit(event, data);
      console.log(`📤 [BROADCAST] ${event}`);
    },

    // Get connection stats
    getStats: () => ({
      admin: clients.admin.size,
      users: clients.user.size,
      anonymous: clients.anonymous.size,
      total: clients.admin.size + clients.user.size + clients.anonymous.size,
    }),
  };
}

module.exports = { initializeSocketIO };
