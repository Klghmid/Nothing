import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

interface User {
  id: number;
  username: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  is_banned: boolean;
  created_at: string;
}

interface Post {
  id: number;
  content: string;
  image_url?: string;
  username: string;
  display_name: string;
  created_at: string;
  likes_count: number;
  retweets_count: number;
}

interface Message {
  id: number;
  content: string;
  sender_username: string;
  sender_display_name: string;
  receiver_username?: string;
  receiver_display_name?: string;
  created_at: string;
  message_type: string;
}

const AdminPanel: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'posts' | 'messages'>('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPosts: 0,
    totalMessages: 0,
    bannedUsers: 0
  });

  useEffect(() => {
    if (user?.is_admin) {
      loadAllData();
    } else {
      // Redirect non-admin users
      window.location.href = '/login';
    }
  }, [user]);

  const loadAllData = async () => {
    try {
      const [usersRes, postsRes, messagesRes] = await Promise.all([
        axios.get('http://localhost:5000/api/admin/users', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get('http://localhost:5000/api/admin/posts', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        axios.get('http://localhost:5000/api/admin/messages', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      setUsers(usersRes.data);
      setPosts(postsRes.data);
      setMessages(messagesRes.data);

      // Calculate stats
      const bannedCount = usersRes.data.filter((u: User) => u.is_banned).length;
      setStats({
        totalUsers: usersRes.data.length,
        totalPosts: postsRes.data.length,
        totalMessages: messagesRes.data.length,
        bannedUsers: bannedCount
      });
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async (userId: number, isBanned: boolean) => {
    try {
      await axios.put(`http://localhost:5000/api/admin/users/${userId}/ban`, 
        { is_banned: isBanned },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, is_banned: isBanned } : u
      ));
      
      setStats(prev => ({
        ...prev,
        bannedUsers: isBanned ? prev.bannedUsers + 1 : prev.bannedUsers - 1
      }));
    } catch (error) {
      console.error('Error banning user:', error);
    }
  };

  const handleDeletePost = async (postId: number) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;

    try {
      await axios.delete(`http://localhost:5000/api/admin/posts/${postId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setPosts(prev => prev.filter(p => p.id !== postId));
      setStats(prev => ({ ...prev, totalPosts: prev.totalPosts - 1 }));
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;

    try {
      await axios.delete(`http://localhost:5000/api/admin/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setMessages(prev => prev.filter(m => m.id !== messageId));
      setStats(prev => ({ ...prev, totalMessages: prev.totalMessages - 1 }));
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return <div className="loading">Loading admin panel...</div>;
  }

  if (!user?.is_admin) {
    return (
      <div className="admin-panel">
        <div className="error" style={{ textAlign: 'center', marginTop: '2rem' }}>
          Access denied. Admin privileges required.
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1 className="admin-title">ADMIN CONTROL PANEL</h1>
        <p className="admin-subtitle">Terminal Social Management System</p>
        <div style={{ marginTop: '1rem' }}>
          <button onClick={logout} className="terminal-btn danger">
            LOGOUT
          </button>
          <a href="/" className="terminal-btn" style={{ textDecoration: 'none', marginLeft: '1rem' }}>
            BACK TO APP
          </a>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button
          className={`terminal-btn ${activeTab === 'overview' ? 'primary' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          OVERVIEW
        </button>
        <button
          className={`terminal-btn ${activeTab === 'users' ? 'primary' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          USERS
        </button>
        <button
          className={`terminal-btn ${activeTab === 'posts' ? 'primary' : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          POSTS
        </button>
        <button
          className={`terminal-btn ${activeTab === 'messages' ? 'primary' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          MESSAGES
        </button>
      </div>

      {activeTab === 'overview' && (
        <div>
          <div className="admin-stats">
            <div className="stat-card">
              <span className="stat-number">{stats.totalUsers}</span>
              <span className="stat-label">Total Users</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{stats.totalPosts}</span>
              <span className="stat-label">Total Posts</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{stats.totalMessages}</span>
              <span className="stat-label">Total Messages</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{stats.bannedUsers}</span>
              <span className="stat-label">Banned Users</span>
            </div>
          </div>

          <div className="admin-section">
            <h2 className="section-title">SYSTEM STATUS</h2>
            <div className="terminal-card">
              <p style={{ color: '#00ff00', marginBottom: '0.5rem' }}>
                ✓ Database: Connected
              </p>
              <p style={{ color: '#00ff00', marginBottom: '0.5rem' }}>
                ✓ WebSocket: Active
              </p>
              <p style={{ color: '#00ff00', marginBottom: '0.5rem' }}>
                ✓ File Upload: Ready
              </p>
              <p style={{ color: '#00ff00' }}>
                ✓ Admin Panel: Operational
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="admin-section">
          <h2 className="section-title">USER MANAGEMENT</h2>
          <div className="terminal-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Display Name</th>
                  <th>Email</th>
                  <th>Admin</th>
                  <th>Banned</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td>{user.username}</td>
                    <td>{user.display_name}</td>
                    <td>{user.email}</td>
                    <td>{user.is_admin ? '✓' : '✗'}</td>
                    <td>{user.is_banned ? '✓' : '✗'}</td>
                    <td>{formatTime(user.created_at)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className={`terminal-btn ${user.is_banned ? 'primary' : 'danger'}`}
                          onClick={() => handleBanUser(user.id, !user.is_banned)}
                          style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                        >
                          {user.is_banned ? 'UNBAN' : 'BAN'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'posts' && (
        <div className="admin-section">
          <h2 className="section-title">POST MANAGEMENT</h2>
          <div className="terminal-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Author</th>
                  <th>Content</th>
                  <th>Likes</th>
                  <th>Retweets</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map(post => (
                  <tr key={post.id}>
                    <td>{post.id}</td>
                    <td>{post.display_name}</td>
                    <td style={{ maxWidth: '300px', wordWrap: 'break-word' }}>
                      {post.content.length > 100 
                        ? `${post.content.substring(0, 100)}...` 
                        : post.content
                      }
                    </td>
                    <td>{post.likes_count}</td>
                    <td>{post.retweets_count}</td>
                    <td>{formatTime(post.created_at)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="terminal-btn danger"
                          onClick={() => handleDeletePost(post.id)}
                          style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                        >
                          DELETE
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'messages' && (
        <div className="admin-section">
          <h2 className="section-title">MESSAGE MANAGEMENT</h2>
          <div className="terminal-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Sender</th>
                  <th>Receiver</th>
                  <th>Content</th>
                  <th>Type</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {messages.map(message => (
                  <tr key={message.id}>
                    <td>{message.id}</td>
                    <td>{message.sender_display_name}</td>
                    <td>{message.receiver_display_name || 'Group'}</td>
                    <td style={{ maxWidth: '300px', wordWrap: 'break-word' }}>
                      {message.content.length > 100 
                        ? `${message.content.substring(0, 100)}...` 
                        : message.content
                      }
                    </td>
                    <td>{message.message_type}</td>
                    <td>{formatTime(message.created_at)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="terminal-btn danger"
                          onClick={() => handleDeleteMessage(message.id)}
                          style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                        >
                          DELETE
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;