import assert from 'node:assert';
import { ReactASTCompressor } from '../compressor.js';

suite('ReactASTCompressor', () => {
  let compressor: ReactASTCompressor;

  setup(() => {
    compressor = new ReactASTCompressor();
  });

  // ─── Comment stripping ────────────────────────────────────────
  test('strips comments', () => {
    const code = `
      // This is a line comment
      /* This is a block comment */
      const x = 1;
    `;
    const { compressed } = compressor.compress(code);
    assert.ok(!compressed.includes('line comment'));
    assert.ok(!compressed.includes('block comment'));
    assert.ok(compressed.includes('const x = 1'));
  });

  // ─── Console.* removal ───────────────────────────────────────
  test('strips console calls', () => {
    const code = `
      import React from 'react';
      function App() {
        console.log('debug');
        console.error('err');
        return <div />;
      }
    `;
    const { compressed } = compressor.compress(code);
    assert.ok(!compressed.includes('console.log'));
    assert.ok(!compressed.includes('console.error'));
    assert.ok(compressed.includes('App'));
  });

  // ─── Hook summarization ──────────────────────────────────────
  test('summarizes useEffect body but keeps deps', () => {
    const code = `
      import React, { useEffect, useState } from 'react';
      function App() {
        const [data, setData] = useState(null);
        useEffect(() => {
          const controller = new AbortController();
          fetch('/api/data', { signal: controller.signal })
            .then(res => res.json())
            .then(json => setData(json))
            .catch(err => console.error(err));
          return () => controller.abort();
        }, []);
        return <div>{data}</div>;
      }
    `;
    const { compressed, savingsPercent } = compressor.compress(code);
    assert.ok(compressed.includes('[]'));
    assert.ok(!compressed.includes('AbortController'));
    assert.ok(!compressed.includes('fetch'));
    assert.ok(compressed.includes('useEffect'));
    assert.ok(savingsPercent > 0, `Expected savings > 0%, got ${savingsPercent}%`);
  });

  // ─── Handler summarization ───────────────────────────────────
  test('summarizes handler functions', () => {
    const code = `
      import React from 'react';
      function Form() {
        const handleSubmit = (e) => {
          e.preventDefault();
          validate();
          submitForm();
          resetFields();
        };
        return <form onSubmit={handleSubmit}><button>Go</button></form>;
      }
    `;
    const { compressed } = compressor.compress(code);
    assert.ok(!compressed.includes('validate'));
    assert.ok(!compressed.includes('submitForm'));
    assert.ok(compressed.includes('handleSubmit'));
  });

  // ─── PropTypes stripping ─────────────────────────────────────
  test('strips propTypes and defaultProps', () => {
    const code = `
      import React from 'react';
      import PropTypes from 'prop-types';
      function Card({ title }) {
        return <div>{title}</div>;
      }
      Card.propTypes = { title: PropTypes.string.isRequired };
      Card.defaultProps = { title: 'Untitled' };
      export default Card;
    `;
    const { compressed } = compressor.compress(code);
    assert.ok(!compressed.includes('propTypes'));
    assert.ok(!compressed.includes('defaultProps'));
    assert.ok(!compressed.includes('prop-types'));
    assert.ok(compressed.includes('Card'));
  });

  // ─── Style collapsing ────────────────────────────────────────
  test('collapses style objects', () => {
    const code = `
      const styles = {
        container: { flex: 1, padding: 20, backgroundColor: '#fff' },
        header: { fontSize: 24, fontWeight: 'bold' },
        content: { marginTop: 10 },
      };
    `;
    const { compressed } = compressor.compress(code);
    assert.ok(!compressed.includes('flex: 1'));
    assert.ok(!compressed.includes('fontSize'));
    assert.ok(compressed.includes('container'));
    assert.ok(compressed.includes('header'));
  });

  // ─── TypeScript type stripping ────────────────────────────────
  test('strips TypeScript annotations', () => {
    const code = `
      interface UserProps {
        name: string;
        age: number;
      }
      type Status = 'active' | 'inactive';
      const greet = (user: UserProps): string => {
        return user.name;
      };
    `;
    const { compressed } = compressor.compress(code);
    assert.ok(!compressed.includes('interface'));
    assert.ok(!compressed.includes('UserProps'));
    assert.ok(!compressed.includes('Status'));
    assert.ok(compressed.includes('greet'));
  });

  // ─── Test attribute stripping ─────────────────────────────────
  test('strips data-testid attributes', () => {
    const code = `
      import React from 'react';
      function Button() {
        return <button data-testid="submit-btn" data-cy="submit" onClick={() => {}}>Submit</button>;
      }
    `;
    const { compressed } = compressor.compress(code);
    assert.ok(!compressed.includes('data-testid'));
    assert.ok(!compressed.includes('data-cy'));
    assert.ok(compressed.includes('onClick'));
  });

  // ─── Full component integration ──────────────────────────────
  test('compresses a realistic component with significant savings', () => {
    const code = `
      import React, { useState, useEffect, useCallback } from 'react';
      import PropTypes from 'prop-types';

      /**
       * UserProfile displays the user's profile information.
       * It fetches data from the API and handles editing.
       */

      interface UserProfileProps {
        userId: string;
        onSave: (data: any) => void;
      }

      type EditMode = 'view' | 'edit';

      const styles = {
        container: { display: 'flex', flexDirection: 'column', padding: '20px', margin: '10px' },
        avatar: { width: 100, height: 100, borderRadius: '50%' },
        name: { fontSize: '24px', fontWeight: 'bold', color: '#333' },
        bio: { fontSize: '14px', color: '#666', lineHeight: 1.6 },
        editButton: { padding: '8px 16px', backgroundColor: '#007bff', color: '#fff', border: 'none' },
      };

      function UserProfile({ userId, onSave }) {
        const [user, setUser] = useState(null);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState(null);
        const [editMode, setEditMode] = useState('view');

        useEffect(() => {
          let cancelled = false;
          const fetchUser = async () => {
            try {
              setLoading(true);
              const response = await fetch('/api/users/' + userId);
              if (!response.ok) throw new Error('Failed to fetch');
              const data = await response.json();
              if (!cancelled) {
                setUser(data);
                setError(null);
              }
            } catch (err) {
              if (!cancelled) {
                setError(err.message);
                console.error('Fetch failed:', err);
              }
            } finally {
              if (!cancelled) setLoading(false);
            }
          };
          fetchUser();
          return () => { cancelled = true; };
        }, [userId]);

        useEffect(() => {
          console.log('Edit mode changed to:', editMode);
          document.title = editMode === 'edit' ? 'Editing Profile' : 'User Profile';
        }, [editMode]);

        const handleSave = useCallback((formData) => {
          setLoading(true);
          fetch('/api/users/' + userId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
          })
            .then(res => res.json())
            .then(updated => {
              setUser(updated);
              setEditMode('view');
              onSave(updated);
              console.log('Saved successfully');
            })
            .catch(err => {
              setError(err.message);
              console.error('Save failed:', err);
            })
            .finally(() => setLoading(false));
        }, [userId, onSave]);

        const handleCancel = () => {
          setEditMode('view');
          setError(null);
          setLoading(false);
          console.log('Edit cancelled');
        };

        if (loading) return <div data-testid="loader">Loading...</div>;
        if (error) return <div data-testid="error">{error}</div>;
        if (!user) return null;

        return (
          <div style={styles.container} data-testid="profile">
            <img src={user.avatar} style={styles.avatar} alt={user.name} />
            <h1 style={styles.name}>{user.name}</h1>
            <p style={styles.bio}>{user.bio}</p>
            {editMode === 'view' ? (
              <button style={styles.editButton} data-testid="edit-btn" onClick={() => setEditMode('edit')}>
                Edit Profile
              </button>
            ) : (
              <div>
                <button onClick={() => handleSave(user)} data-testid="save-btn">Save</button>
                <button onClick={handleCancel} data-testid="cancel-btn">Cancel</button>
              </div>
            )}
          </div>
        );
      }

      UserProfile.propTypes = {
        userId: PropTypes.string.isRequired,
        onSave: PropTypes.func.isRequired,
      };

      UserProfile.defaultProps = {
        onSave: () => {},
      };

      export default UserProfile;
    `;

    const result = compressor.compress(code);

    // Structural elements must survive
    assert.ok(result.compressed.includes('UserProfile'));
    assert.ok(result.compressed.includes('useState'));
    assert.ok(result.compressed.includes('userId'));

    // Noise must be gone
    assert.ok(!result.compressed.includes('console.log'));
    assert.ok(!result.compressed.includes('console.error'));
    assert.ok(!result.compressed.includes('propTypes'));
    assert.ok(!result.compressed.includes('defaultProps'));
    assert.ok(!result.compressed.includes('prop-types'));
    assert.ok(!result.compressed.includes('data-testid'));
    assert.ok(!result.compressed.includes('interface'));
    assert.ok(!result.compressed.includes('borderRadius'));

    // Should achieve meaningful compression
    assert.ok(
      result.savingsPercent >= 30,
      `Expected >= 30% savings, got ${result.savingsPercent}%`,
    );
  });

  // ─── Token estimation ────────────────────────────────────────
  test('token estimation is reasonable', () => {
    const code = 'const x = 1;';
    const tokens = compressor.countTokens(code);
    assert.ok(tokens >= 3 && tokens <= 8, `Expected 3-8, got ${tokens}`);
  });

  // ─── Error recovery ──────────────────────────────────────────
  test('handles invalid syntax gracefully with errorRecovery', () => {
    const code = 'const x = {;';
    assert.doesNotThrow(() => compressor.compress(code));
  });

  // ─── Rule toggling ───────────────────────────────────────────
  test('respects disabled rules', () => {
    const compressorNoComments = new ReactASTCompressor({ stripComments: false });
    const code = `
      // Keep this comment
      const x = 1;
    `;
    const { compressed } = compressorNoComments.compress(code);
    assert.ok(compressed.includes('Keep this comment'));
  });
});
