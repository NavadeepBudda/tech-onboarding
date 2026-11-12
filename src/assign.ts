import { ObjectId } from "mongodb";
import { collections, type Assignment } from "./db.js";

export type AssignResult =
  | { kind: "assigned"; assignment: Assignment }
  | { kind: "judge-busy" } // the judge already holds a QUEUED assignment
  | { kind: "none-available" }; // no project is eligible for this judge right now

export async function assignNext(judgeId: string): Promise<AssignResult> {
  const { projects, assignments } = collections();

  if (await assignments.findOne({ judgeId, status: "QUEUED" })) {
    return { kind: "judge-busy" };
  }

  const unavailableIds = await assignments.distinct("projectId", {
    $or: [{ judgeId }, { status: "QUEUED" }],
  });
  const available = await projects.find({ _id: { $nin: unavailableIds } }).toArray();

  if (available.length === 0) {
    return { kind: "none-available" };
  }

  const counts = await Promise.all(
    available.map(async (project) => ({
      projectId: project._id,
      completed: await assignments.countDocuments({ projectId: project._id, status: "COMPLETED" }),
    }))
  );
  const fewestCompleted = Math.min(...counts.map((project) => project.completed));
  const candidates = counts.filter((project) => project.completed === fewestCompleted);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  const assignment: Assignment = {
    _id: new ObjectId(),
    judgeId,
    projectId: chosen.projectId,
    status: "QUEUED",
    createdAt: new Date(),
  };
  await assignments.insertOne(assignment);
  return { kind: "assigned", assignment };
}
