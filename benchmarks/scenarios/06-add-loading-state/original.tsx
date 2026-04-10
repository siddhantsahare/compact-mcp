import React, { useState } from 'react';

interface ContactFormData {
  name: string;
  email: string;
  message: string;
}

interface Props {
  onSuccess: () => void;
}

export function ContactForm({ onSuccess }: Props) {
  const [form, setForm] = useState<ContactFormData>({ name: '', email: '', message: '' });

  // Problem: no loading state — user can click Submit multiple times,
  // gets no feedback, and the button stays enabled during the request.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    onSuccess();
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Name
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          required
          className="border rounded px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          required
          className="border rounded px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Message
        <textarea
          name="message"
          value={form.message}
          onChange={handleChange}
          required
          rows={5}
          className="border rounded px-3 py-2 resize-none"
        />
      </label>
      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Send message
      </button>
    </form>
  );
}
