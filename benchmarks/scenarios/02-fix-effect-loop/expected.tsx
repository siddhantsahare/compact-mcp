import React, { useState, useEffect } from 'react';

interface User {
  id: number;
  name: string;
  email: string;
  avatarUrl: string;
}

export function UserProfile({ userId }: { userId: number }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeEmail, setIncludeEmail] = useState(true);
  const [includeAvatar] = useState(true);

  useEffect(() => {
    setError(null);
    const params = new URLSearchParams({
      email: String(includeEmail),
      avatar: String(includeAvatar),
    });

    fetch(`/api/users/${userId}?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch user');
        return r.json();
      })
      .then((data: User) => setUser(data))
      .catch((err: Error) => setError(err.message));
  }, [userId, includeEmail, includeAvatar]);

  const toggleEmail = () => setIncludeEmail((prev) => !prev);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!user) return <div className="animate-pulse h-20 bg-gray-200 rounded" />;

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      {includeAvatar && (
        <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full" />
      )}
      <div>
        <h2 className="font-semibold">{user.name}</h2>
        {includeEmail && (
          <p className="text-sm text-gray-500">{user.email}</p>
        )}
      </div>
      <button onClick={toggleEmail} className="ml-auto text-sm underline">
        {includeEmail ? 'Hide email' : 'Show email'}
      </button>
    </div>
  );
}
