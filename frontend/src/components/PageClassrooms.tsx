import React, { useState } from 'react';
import {
  School,
  Plus,
  Trash2,
  Edit2,
  Zap,
  Search,
  X,
  Download,
  Filter
} from 'lucide-react';
import type { Room } from '../types/campus';
import { api } from '../services/api';

interface PageClassroomsProps {
  rooms: Room[];
  onRefreshRooms: () => void;
  onSelectRoom: (room: Room) => void;
}

export const PageClassrooms: React.FC<PageClassroomsProps> = ({
  rooms,
  onRefreshRooms,
  onSelectRoom,
}) => {
  const [search, setSearch] = useState<string>('');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  // Form State
  const [building, setBuilding] = useState<string>('');
  const [roomNumber, setRoomNumber] = useState<string>('');
  const [capacity, setCapacity] = useState<number>(40);
  const [roomType, setRoomType] = useState<string>('Lecture Hall');
  const [cameraSource, setCameraSource] = useState<string>('webcam_0');
  const [operatingHours, setOperatingHours] = useState<string>('08:00 - 18:00');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const buildingsList = Array.from(new Set(rooms.map((r) => r.building)));

  const filteredRooms = rooms.filter((r) => {
    const matchesSearch =
      r.building.toLowerCase().includes(search.toLowerCase()) ||
      r.room_number.toLowerCase().includes(search.toLowerCase()) ||
      r.room_type.toLowerCase().includes(search.toLowerCase());
    const matchesBuilding = buildingFilter === 'all' || r.building === buildingFilter;
    return matchesSearch && matchesBuilding;
  });

  const resetForm = () => {
    setBuilding('');
    setRoomNumber('');
    setCapacity(40);
    setRoomType('Lecture Hall');
    setCameraSource('webcam_0');
    setOperatingHours('08:00 - 18:00');
    setFormError(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (room: Room) => {
    setEditingRoom(room);
    setBuilding(room.building);
    setRoomNumber(room.room_number);
    setCapacity(room.capacity);
    setRoomType(room.room_type);
    setCameraSource(room.camera_source);
    setOperatingHours(room.operating_hours);
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!building.trim() || !roomNumber.trim()) {
      setFormError('Building and Room Number are required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      await api.createRoom({
        building: building.trim(),
        room_number: roomNumber.trim(),
        capacity: Number(capacity),
        room_type: roomType,
        camera_source: cameraSource,
        operating_hours: operatingHours,
      });
      setIsAddModalOpen(false);
      resetForm();
      onRefreshRooms();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Failed to create classroom.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;

    setIsSubmitting(true);
    setFormError(null);
    try {
      await api.updateRoom(editingRoom.id, {
        building: building.trim(),
        room_number: roomNumber.trim(),
        capacity: Number(capacity),
        room_type: roomType,
        camera_source: cameraSource,
        operating_hours: operatingHours,
      });
      setIsEditModalOpen(false);
      resetForm();
      onRefreshRooms();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Failed to update classroom.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRoom = async (roomId: number, label: string) => {
    if (!window.confirm(`Are you sure you want to delete classroom "${label}"? This will remove all associated logs.`)) {
      return;
    }

    try {
      await api.deleteRoom(roomId);
      onRefreshRooms();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete room.');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-cyan-50 text-cyan-700 border border-cyan-100 mb-2">
            <School className="w-3.5 h-3.5" /> Space Management
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Campus Classroom Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Configure buildings, maximum seating capacity, and vision camera sources across campus zones.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={api.getExportRoomsCsvUrl()}
            download="campustwin_rooms_report.csv"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 transition whitespace-nowrap cursor-pointer shadow-sm hover:border-slate-300"
          >
            <Download className="w-4 h-4 text-cyan-600" /> Export CSV Report
          </a>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#1e293b] hover:bg-[#0f172a] text-white shadow-md transition whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Classroom
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search Input Bar */}
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search classrooms, buildings, or types..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-slate-200/80 text-slate-800 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 shadow-sm"
          />
        </div>

        {/* Building Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 text-[11px] flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filter:
          </span>
          <button
            onClick={() => setBuildingFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap ${
              buildingFilter === 'all'
                ? 'bg-[#1e293b] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
            }`}
          >
            All Buildings ({rooms.length})
          </button>
          {buildingsList.map((b) => (
            <button
              key={b}
              onClick={() => setBuildingFilter(b)}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap ${
                buildingFilter === b
                  ? 'bg-[#1e293b] text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Classrooms Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredRooms.map((room) => {
          const occPct = room.occupancy_percentage;
          let badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
          if (room.utilization_status === 'full') badgeBg = 'bg-rose-50 text-rose-700 border-rose-200';
          else if (room.utilization_status === 'high') badgeBg = 'bg-amber-50 text-amber-700 border-amber-200';
          else if (room.utilization_status === 'normal') badgeBg = 'bg-blue-50 text-blue-700 border-blue-200';

          return (
            <div
              key={room.id}
              className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-sm hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-600">
                      {room.building}
                    </span>
                    <h3 className="text-xl font-extrabold text-slate-900">{room.room_number}</h3>
                    <span className="inline-block mt-0.5 text-xs text-slate-500">{room.room_type}</span>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeBg}`}>
                    {room.utilization_status}
                  </span>
                </div>

                {/* Occupancy Indicator */}
                <div className="space-y-1.5 my-4">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-700">
                      {room.current_occupancy} <span className="text-slate-400">/ {room.capacity} seats</span>
                    </span>
                    <span className="text-cyan-700 font-bold">{occPct}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, occPct)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-500 py-3 border-t border-slate-100">
                  <div className="flex justify-between">
                    <span>Operating Hours:</span>
                    <span className="text-slate-800 font-medium">{room.operating_hours}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Camera Source:</span>
                    <span className="text-cyan-700 font-medium">{room.camera_source}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-2">
                <button
                  onClick={() => onSelectRoom(room)}
                  className="text-xs font-bold text-cyan-600 hover:text-cyan-700 flex items-center gap-1"
                >
                  <Zap className="w-3.5 h-3.5" /> Monitor Room
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEdit(room)}
                    title="Edit Classroom"
                    className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 transition border border-slate-200/60"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteRoom(room.id, `${room.building} - ${room.room_number}`)}
                    title="Delete Classroom"
                    className="p-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition border border-slate-200/60"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ADD / EDIT MODAL */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-100 shadow-2xl p-6 space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {isAddModalOpen ? 'Add New Classroom' : `Edit Classroom: ${editingRoom?.building} - ${editingRoom?.room_number}`}
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setIsEditModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={isAddModalOpen ? handleAddSubmit : handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Building Name</label>
                  <input
                    type="text"
                    required
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    placeholder="e.g. Science Block"
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Room Number</label>
                  <input
                    type="text"
                    required
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder="e.g. SCI-101"
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Max Capacity (Seats)</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    required
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Room Type</label>
                  <select
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="Lecture Hall">Lecture Hall</option>
                    <option value="Computer Lab">Computer Lab</option>
                    <option value="Study Lounge">Study Lounge</option>
                    <option value="Executive Seminar">Executive Seminar</option>
                    <option value="Grand Auditorium">Grand Auditorium</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Camera Source</label>
                  <select
                    value={cameraSource}
                    onChange={(e) => setCameraSource(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="webcam_0">Laptop Webcam (Index 0)</option>
                    <option value="uploaded_video">Uploaded Video File</option>
                    <option value="demo_feed">Synthetic Demo Feed</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Operating Hours</label>
                  <input
                    type="text"
                    value={operatingHours}
                    onChange={(e) => setOperatingHours(e.target.value)}
                    placeholder="e.g. 08:00 - 18:00"
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setIsEditModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#1e293b] hover:bg-[#0f172a] text-white shadow-md transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : isAddModalOpen ? 'Create Classroom' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};