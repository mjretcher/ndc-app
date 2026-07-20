import { z } from "zod";

export const guardianSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  relationship: z.string().trim().max(60).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").max(200),
  phone: z.string().trim().min(7, "Enter a phone number").max(30),
  preferredContact: z.enum(["email", "phone", "text"]).default("email"),
  isEmergencyContact: z.boolean().default(false),
});

export const membershipInfoSchema = z.object({
  status: z.enum(["have", "not_yet"]).default("not_yet"),
  membershipNumber: z.string().trim().max(60).optional().or(z.literal("")),
  membershipType: z.string().trim().max(60).optional().or(z.literal("")),
  expirationDate: z.string().trim().max(10).optional().or(z.literal("")),
});

export const diverSchema = z.object({
  legalName: z.string().trim().min(1, "Legal name is required").max(120),
  preferredName: z.string().trim().max(120).optional().or(z.literal("")),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a birth date"),
  school: z.string().trim().max(120).optional().or(z.literal("")),
  grade: z.string().trim().max(20).optional().or(z.literal("")),
  experience: z.string().trim().max(2000).optional().or(z.literal("")),
  activitiesNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  requestedGroup: z.string().trim().max(60).default("unsure"),
  // Safety & medical — stored separately server-side, restricted access
  allergies: z.string().trim().max(2000).optional().or(z.literal("")),
  medicalConsiderations: z.string().trim().max(2000).optional().or(z.literal("")),
  emergencyNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  aau: membershipInfoSchema,
  usaDiving: membershipInfoSchema,
});

export const registrationSchema = z.object({
  family: z.object({
    billingName: z.string().trim().min(1, "Family / billing name is required").max(160),
    addressLine1: z.string().trim().min(1, "Address is required").max(200),
    addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
    city: z.string().trim().min(1, "City is required").max(120),
    state: z.string().trim().min(2, "State is required").max(40),
    zip: z.string().trim().min(3, "ZIP is required").max(12),
  }),
  guardians: z.array(guardianSchema).min(1, "At least one guardian is required").max(4),
  emergencyContact: z.object({
    name: z.string().trim().min(1, "Emergency contact name is required").max(120),
    phone: z.string().trim().min(7, "Emergency contact phone is required").max(30),
    relationship: z.string().trim().max(60).optional().or(z.literal("")),
  }),
  divers: z.array(diverSchema).min(1, "Add at least one diver").max(8),
  billingPreference: z.enum(["flat_monthly", "per_practice", "high_school", "unsure"]).default("unsure"),
  waiver: z.object({
    acknowledgedRisk: z.literal(true, { message: "Required" }),
    acknowledgedPlacement: z.literal(true, { message: "Required" }),
    acknowledgedPrivacy: z.literal(true, { message: "Required" }),
    signatureName: z.string().trim().min(1, "Type your full name to sign").max(120),
    signatureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
});

export type RegistrationPayload = z.infer<typeof registrationSchema>;

export function emptyDiver(): z.input<typeof diverSchema> {
  return {
    legalName: "", preferredName: "", birthDate: "", school: "", grade: "",
    experience: "", activitiesNotes: "", requestedGroup: "unsure",
    allergies: "", medicalConsiderations: "", emergencyNotes: "",
    aau: { status: "not_yet", membershipNumber: "", membershipType: "", expirationDate: "" },
    usaDiving: { status: "not_yet", membershipNumber: "", membershipType: "", expirationDate: "" },
  };
}
