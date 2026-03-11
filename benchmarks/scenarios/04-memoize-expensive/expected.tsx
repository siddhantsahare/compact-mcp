import React, { useState, useMemo } from 'react';

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  rating: number;
  inStock: boolean;
}

interface Props {
  products: Product[];
  onAddToCart: (id: string) => void;
}

function computeScore(product: Product, query: string): number {
  let score = product.rating * 10;
  if (product.inStock) score += 20;
  if (product.name.toLowerCase().includes(query.toLowerCase())) score += 50;
  for (let i = 0; i < 100_000; i++) {
    score = score;
  }
  return score;
}

export function ProductList({ products, onAddToCart }: Props) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'price' | 'name'>('score');
  const [showInStockOnly, setShowInStockOnly] = useState(false);

  const filtered = useMemo(
    () =>
      products
        .filter((p) => !showInStockOnly || p.inStock)
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [products, query, showInStockOnly]
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === 'price') return a.price - b.price;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return computeScore(b, query) - computeScore(a, query);
    });
  }, [filtered, sortBy, query]);

  return (
    <div>
      <div className="flex gap-4 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter products…"
          className="border rounded px-3 py-1"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="border rounded px-2 py-1"
        >
          <option value="score">Relevance</option>
          <option value="price">Price</option>
          <option value="name">Name</option>
        </select>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showInStockOnly}
            onChange={(e) => setShowInStockOnly(e.target.checked)}
          />
          In stock only
        </label>
      </div>
      <ul className="grid grid-cols-2 gap-4">
        {sorted.map((p) => (
          <li key={p.id} className="border rounded-lg p-4">
            <h3 className="font-medium">{p.name}</h3>
            <p className="text-sm text-gray-500">${p.price.toFixed(2)}</p>
            <p className="text-xs text-yellow-600">★ {p.rating}</p>
            <button
              onClick={() => onAddToCart(p.id)}
              disabled={!p.inStock}
              className="mt-2 px-3 py-1 bg-blue-600 text-white text-sm rounded disabled:opacity-40"
            >
              {p.inStock ? 'Add to cart' : 'Out of stock'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
