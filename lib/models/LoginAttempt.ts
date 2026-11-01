import mongoose, { Schema, Document, Model } from 'mongoose';

/** One failed-login counter. Rows delete themselves via the TTL index once their window and lock are over. */
export interface ILoginAttempt extends Document {
  key:         string;
  count:       number;
  resetAt:     Date;
  lockedUntil: Date | null;
  expiresAt:   Date;
}

const LoginAttemptSchema = new Schema<ILoginAttempt>({
  key:         { type: String, required: true, unique: true },
  count:       { type: Number, default: 0 },
  resetAt:     { type: Date, required: true },
  lockedUntil: { type: Date, default: null },
  expiresAt:   { type: Date, required: true, index: { expires: 0 } },
});

const LoginAttempt: Model<ILoginAttempt> =
  mongoose.models.LoginAttempt || mongoose.model<ILoginAttempt>('LoginAttempt', LoginAttemptSchema);

export default LoginAttempt;
