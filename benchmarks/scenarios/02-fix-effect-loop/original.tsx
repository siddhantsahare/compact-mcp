import React, { useState, useEffect } from 'react';

interface User {
  id: number;
  name: string;
  email: string;
  avatarUrl: string;
}

interface Filters {
  includeEmail: boolean;
  includeAvatar: boolean;
}

export function UserProfile({ userId }: { userId: number }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bug: filters is an object — recreated on every render.
  // Including it in the dep array causes an infinite loop.
  const [filters, setFilters] = useState<Filters>({
    includeEmail: true,
    includeAvatar: true,
  });

  useEffect(() => {
    setError(null);
    const params = new URLSearchParams({
      email: String(filters.includeEmail),
      avatar: String(filters.includeAvatar),
    });

    fetch(`/api/users/${userId}?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch user');
        return r.json();
      })
      .then((data) => {
        setUser(data);
        // Bug: mutating filters inside the effect that depends on filters
        setFilters({ ...filters, includeEmail: data.emailVerified });
      })
      .catch((err: Error) => setError(err.message));
  }, [userId, filters]); // <-- object reference changes every render → infinite loop

  const toggleEmail = () =>
    setFilters((prev) => ({ ...prev, includeEmail: !prev.includeEmail }));

  if (error) return <p className="text-red-600">{error}</p>;
  if (!user) return <div className="animate-pulse h-20 bg-gray-200 rounded" />;

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      {filters.includeAvatar && (
        <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full" />
      )}
      <div>
        <h2 className="font-semibold">{user.name}</h2>
        {filters.includeEmail && (
          <p className="text-sm text-gray-500">{user.email}</p>
        )}
      </div>
      <button onClick={toggleEmail} className="ml-auto text-sm underline">
        {filters.includeEmail ? 'Hide email' : 'Show email'}
      </button>
    </div>
  );
}
