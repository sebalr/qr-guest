import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getEventsApi, createEventApi, Event } from '../api';

export default function EventsPage() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getEventsApi()
      .then((r) => setEvents(r.data.data))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    setCreating(true);
    try {
      const res = await createEventApi({ name, starts_at: startsAt, ends_at: endsAt });
      setEvents((prev) => [res.data.data, ...prev]);
      setShowForm(false);
      setName('');
      setStartsAt('');
      setEndsAt('');
    } catch {
      setFormError('Failed to create event.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-700 text-white px-6 py-4 flex justify-between items-center shadow">
        <h1 className="text-xl font-bold">QR Guest</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-80">{user?.email}</span>
          <button onClick={logout} className="text-sm bg-blue-800 px-3 py-1 rounded hover:bg-blue-900">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-800">Events</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-blue-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-800"
          >
            {showForm ? 'Cancel' : '+ New Event'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-xl shadow p-6 mb-6 space-y-4">
            <h3 className="font-semibold text-lg text-gray-700">Create Event</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Starts At</label>
                <input
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ends At</label>
                <input
                  type="datetime-local"
                  required
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <button
              type="submit"
              disabled={creating}
              className="bg-blue-700 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-60"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-gray-500 text-center py-12">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-gray-400 text-center py-12">No events yet. Create one above.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="bg-white rounded-xl shadow p-5 flex justify-between items-center cursor-pointer hover:shadow-md transition"
                onClick={() => navigate(`/events/${ev.id}`)}
              >
                <div>
                  <p className="font-semibold text-gray-800">{ev.name}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(ev.starts_at).toLocaleString()} – {new Date(ev.ends_at).toLocaleString()}
                  </p>
                </div>
                <span className="text-blue-600 text-sm font-medium">View →</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
