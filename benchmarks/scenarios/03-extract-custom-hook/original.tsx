import React, { useState, useEffect, useCallback } from 'react';

interface SearchResult {
  id: string;
  title: string;
  excerpt: string;
  category: string;
}

const CATEGORIES = ['all', 'articles', 'videos', 'podcasts'] as const;
type Category = (typeof CATEGORIES)[number];

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // All search logic lives inline — hard to test or reuse
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(
      `/api/search?q=${encodeURIComponent(query)}&category=${category}&page=${page}`,
      { signal: controller.signal }
    )
      .then((r) => {
        if (!r.ok) throw new Error(`Search failed: ${r.status}`);
        return r.json();
      })
      .then((data: SearchResult[]) => {
        setResults(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [query, category, page]);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setPage(1); // reset pagination on new search
    },
    []
  );

  const handleCategoryChange = useCallback((cat: Category) => {
    setCategory(cat);
    setPage(1);
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <input
        type="search"
        value={query}
        onChange={handleQueryChange}
        placeholder="Search…"
        className="w-full border rounded-lg px-4 py-2 mb-4"
      />
      <div className="flex gap-2 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategoryChange(cat)}
            className={`px-3 py-1 rounded-full text-sm ${
              category === cat ? 'bg-blue-600 text-white' : 'bg-gray-100'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      {loading && <p className="text-center text-gray-500">Searching…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {results.map((r) => (
        <div key={r.id} className="border-b py-3">
          <h3 className="font-medium">{r.title}</h3>
          <p className="text-sm text-gray-500">{r.excerpt}</p>
        </div>
      ))}
      {results.length > 0 && (
        <div className="flex justify-between mt-4">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Previous
          </button>
          <span>Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
