import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import io from 'socket.io-client';

const socket = io('http://localhost:5000');

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

interface User {
  id: number;
  username: string;
  display_name: string;
}

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'posts' | 'messages'>('posts');
  const [posts, setPosts] = useState<Post[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPost, setNewPost] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
    
    // Socket listeners
    socket.on('new_post', (post: Post) => {
      setPosts(prev => [post, ...prev]);
    });

    socket.on('new_message', (message: Message) => {
      if (selectedUser && 
          (message.sender_username === selectedUser.username || 
           message.receiver_username === selectedUser.username)) {
        setMessages(prev => [...prev, message]);
      }
    });

    socket.on('post_deleted', (data: { id: number }) => {
      setPosts(prev => prev.filter(post => post.id !== data.id));
    });

    socket.on('message_deleted', (data: { id: number }) => {
      setMessages(prev => prev.filter(message => message.id !== data.id));
    });

    return () => {
      socket.off('new_post');
      socket.off('new_message');
      socket.off('post_deleted');
      socket.off('message_deleted');
    };
  }, [selectedUser]);

  const loadInitialData = async () => {
    try {
      const [postsRes, usersRes] = await Promise.all([
        axios.get('http://localhost:5000/api/posts'),
        axios.get('http://localhost:5000/api/users')
      ]);
      
      setPosts(postsRes.data);
      setUsers(usersRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (userId: number) => {
    try {
      const response = await axios.get(`http://localhost:5000/api/messages/${userId}`);
      setMessages(response.data);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleUserSelect = (selectedUser: User) => {
    setSelectedUser(selectedUser);
    loadMessages(selectedUser.id);
  };

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.trim()) return;

    try {
      await axios.post('http://localhost:5000/api/posts', {
        content: newPost
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setNewPost('');
    } catch (error) {
      console.error('Error creating post:', error);
    }
  };

  const handleMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser) return;

    try {
      await axios.post('http://localhost:5000/api/messages', {
        receiver_id: selectedUser.id,
        content: newMessage
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return <div className="loading">Loading terminal...</div>;
  }

  return (
    <div className="App">
      <div className="terminal-header">
        <div>
          <h1 className="terminal-title">TERMINAL SOCIAL</h1>
          <p className="terminal-subtitle">Welcome to the matrix, {user?.display_name}</p>
        </div>
        <div className="user-info">
          <span className="username">{user?.username}</span>
          {user?.is_admin && (
            <a href="/admin" className="terminal-btn" style={{ textDecoration: 'none', marginRight: '1rem' }}>
              ADMIN
            </a>
          )}
          <button onClick={logout} className="logout-btn">
            LOGOUT
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="sidebar">
          <div className="terminal-card">
            <h3 style={{ color: '#00ff00', marginBottom: '1rem' }}>NAVIGATION</h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                className={`terminal-btn ${activeTab === 'posts' ? 'primary' : ''}`}
                onClick={() => setActiveTab('posts')}
                style={{ flex: 1 }}
              >
                POSTS
              </button>
              <button
                className={`terminal-btn ${activeTab === 'messages' ? 'primary' : ''}`}
                onClick={() => setActiveTab('messages')}
                style={{ flex: 1 }}
              >
                MESSAGES
              </button>
            </div>
          </div>

          {activeTab === 'messages' && (
            <div className="terminal-card">
              <h3 style={{ color: '#00ff00', marginBottom: '1rem' }}>USERS</h3>
              <ul className="user-list">
                {users.map(userItem => (
                  <li
                    key={userItem.id}
                    className={`user-item ${selectedUser?.id === userItem.id ? 'active' : ''}`}
                    onClick={() => handleUserSelect(userItem)}
                  >
                    <span className="user-name">{userItem.display_name}</span>
                    <div className="user-status"></div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="content-area">
          {activeTab === 'posts' ? (
            <div>
              <div className="terminal-card">
                <h3 style={{ color: '#00ff00', marginBottom: '1rem' }}>CREATE POST</h3>
                <form onSubmit={handlePostSubmit}>
                  <textarea
                    className="terminal-input"
                    value={newPost}
                    onChange={(e) => setNewPost(e.target.value)}
                    placeholder="What's happening in the matrix?"
                    rows={3}
                    style={{ resize: 'vertical', minHeight: '80px' }}
                  />
                  <button
                    type="submit"
                    className="terminal-btn primary"
                    style={{ marginTop: '0.5rem' }}
                    disabled={!newPost.trim()}
                  >
                    POST
                  </button>
                </form>
              </div>

              <div>
                <h3 style={{ color: '#00ff00', marginBottom: '1rem' }}>RECENT POSTS</h3>
                {posts.map(post => (
                  <div key={post.id} className="post">
                    <div className="post-header">
                      <span className="post-author">{post.display_name}</span>
                      <span className="post-time">{formatTime(post.created_at)}</span>
                    </div>
                    <div className="post-content">{post.content}</div>
                    {post.image_url && (
                      <img src={`http://localhost:5000${post.image_url}`} alt="Post" className="post-image" />
                    )}
                    <div className="post-actions">
                      <button className="post-action">LIKE ({post.likes_count})</button>
                      <button className="post-action">RETWEET ({post.retweets_count})</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              {selectedUser ? (
                <div>
                  <div className="terminal-card">
                    <h3 style={{ color: '#00ff00', marginBottom: '1rem' }}>
                      Chat with {selectedUser.display_name}
                    </h3>
                    <form onSubmit={handleMessageSubmit}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="text"
                          className="terminal-input"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type your message..."
                          style={{ flex: 1 }}
                        />
                        <button
                          type="submit"
                          className="terminal-btn primary"
                          disabled={!newMessage.trim()}
                        >
                          SEND
                        </button>
                      </div>
                    </form>
                  </div>

                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {messages.map(message => (
                      <div
                        key={message.id}
                        className={`message ${
                          message.sender_username === user?.username ? 'sent' : 'received'
                        }`}
                      >
                        <div className="message-header">
                          <span className="message-sender">
                            {message.sender_display_name}
                          </span>
                          <span className="message-time">
                            {formatTime(message.created_at)}
                          </span>
                        </div>
                        <div className="message-content">{message.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="terminal-card">
                  <h3 style={{ color: '#00ff00', textAlign: 'center' }}>
                    Select a user to start messaging
                  </h3>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;