import mongoose, { Schema, Document, Model } from 'mongoose';
import { SECTION_TYPES, type SectionSettings, type SectionType, type Tile } from '@/lib/homepage/types';

export interface IHomeSection extends Document {
  type:      SectionType;
  title:     string;
  subtitle:  string;
  isActive:  boolean;
  order:     number;
  startsAt:  Date | null;
  endsAt:    Date | null;
  tiles:     Tile[];
  settings:  SectionSettings;
  createdAt: Date;
  updatedAt: Date;
}

const TileSchema = new Schema<Tile>(
  {
    image:               { type: String, required: true },
    imagePublicId:       { type: String, default: '' },
    poster:              { type: String, default: '' },
    mobilePoster:        { type: String, default: '' },
    mobileImage:         { type: String, default: '' },
    mobileImagePublicId: { type: String, default: '' },
    link:                { type: String, default: '' },
    alt:                 { type: String, default: '' },
    badge:               { type: String, default: '' },
    hidden:              { type: Boolean, default: false },
  },
);

const HomeSectionSchema = new Schema<IHomeSection>(
  {
    type:     { type: String, enum: SECTION_TYPES, required: true },
    title:    { type: String, default: '' },
    subtitle: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    order:    { type: Number, default: 0 },
    startsAt: { type: Date, default: null },
    endsAt:   { type: Date, default: null },
    tiles:    { type: [TileSchema], default: [] },
    settings: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false },
);

if (process.env.NODE_ENV !== 'production') delete mongoose.models.HomeSection;

const HomeSection: Model<IHomeSection> =
  mongoose.models.HomeSection || mongoose.model<IHomeSection>('HomeSection', HomeSectionSchema);

export default HomeSection;
