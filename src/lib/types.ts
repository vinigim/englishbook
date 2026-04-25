export type UserRole = "aluno" | "professor";

export type LessonTopic = {
  id: string;
  name: string;
  slug: string;
};
export type SlotStatus = "available" | "pending" | "booked" | "cancelled";
export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "cancelled"
  | "completed";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  avatar_url: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type Teacher = {
  id: string;
  bio: string | null;
  hourly_price_cents: number;
  active: boolean;
};

export type Student = {
  id: string;
  daily_availability_email: boolean;
  preferred_teacher_ids: string[];
};

export type AvailabilitySlot = {
  id: string;
  teacher_id: string;
  start_at: string;
  end_at: string;
  status: SlotStatus;
  held_by_student_id: string | null;
  held_until: string | null;
};

export type TeacherVideo = {
  id: string;
  teacher_id: string;
  topic_id: string | null;
  title: string;
  description: string | null;
  storage_path: string;
  created_at: string;
};

export type Booking = {
  id: string;
  student_id: string;
  teacher_id: string;
  slot_id: string;
  status: BookingStatus;
  price_cents: number;
  currency: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  topic_id: string | null;
};
