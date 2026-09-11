import {
  confirmMyPrivateProject,
  createBetaPrivateProject,
  createPrivateProjectCheckout,
  getBetaPrivateSharingAccess,
  getPrivateProjectRoute,
  listMyTrackPrivateProjects,
  revokeMyPrivateProject,
  type PrivateProject as ApiPrivateProject,
  type PrivateProjectContent as ApiPrivateProjectContent,
  type SharedTrack,
} from "@workspace/api-client-react";

export type PrivateProject = ApiPrivateProject;
export type PrivateProjectContent = ApiPrivateProjectContent;

export async function startPrivateProjectCheckout(trackId: string) {
  return createPrivateProjectCheckout(trackId, {});
}

export async function startBetaPrivateProject(trackId: string) {
  return createBetaPrivateProject(trackId);
}

export async function getBetaPrivateSharingEligibility(): Promise<boolean> {
  const access = await getBetaPrivateSharingAccess();
  return access.enabled;
}

export async function confirmPrivateProject(
  projectId: string,
  sessionId: string,
) {
  return confirmMyPrivateProject(projectId, { sessionId });
}

export async function listPrivateProjects(trackId: string) {
  return listMyTrackPrivateProjects(trackId);
}

export async function revokePrivateProject(projectId: string) {
  return revokeMyPrivateProject(projectId);
}

export async function fetchPrivateProjectRoute(
  token: string,
): Promise<PrivateProjectContent> {
  return getPrivateProjectRoute(token);
}