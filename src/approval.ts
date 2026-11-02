export type GradeRequest = { assignment: string; student: string; score: number; comments: string };
export type Approver = (req: GradeRequest) => Promise<boolean>;
