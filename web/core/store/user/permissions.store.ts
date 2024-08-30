import set from "lodash/set";
import unset from "lodash/unset";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import { IProjectMember, IUserProjectsRole, IWorkspaceMemberMe } from "@plane/types";
// plane web types
import {
  EUserPermissions,
  EUserPermissionsLevel,
  TUserPermissions,
  TUserPermissionsLevel,
} from "@/plane-web/constants/user-permissions";
// plane web services
import { WorkspaceService } from "@/plane-web/services/workspace.service";
// services
import userService from "@/services/user.service";
import projectMemberService from "@/services/project/project-member.service";
// store
import { CoreRootStore } from "@/store/root.store";

// derived services
const workspaceService = new WorkspaceService();

export interface IUserPermissionStore {
  // observables
  workspaceUserInfo: Record<string, IWorkspaceMemberMe>; // workspaceSlug -> IWorkspaceMemberMe
  projectUserInfo: Record<string, Record<string, IProjectMember>>; // workspaceSlug -> projectId -> IProjectMember
  projectPermissions: Record<string, IUserProjectsRole>; // workspaceSlug -> IUserProjectsRole
  // computed
  // computed helpers
  workspaceInfoBySlug: (workspaceSlug: string) => IWorkspaceMemberMe | undefined;
  projectPermissionsByWorkspaceSlugAndProjectId: (
    workspaceSlug: string,
    projectId: string
  ) => IUserProjectsRole | undefined;
  allowPermissions: (
    allowPermissions: TUserPermissions[],
    level: TUserPermissionsLevel,
    onPermissionAllowed?: () => boolean,
    workspaceSlug?: string,
    projectId?: string
  ) => boolean;
  // action helpers
  // actions
  fetchUserWorkspaceInfo: (workspaceSlug: string) => Promise<IWorkspaceMemberMe | undefined>;
  leaveWorkspace: (workspaceSlug: string) => Promise<void>;
  fetchUserProjectInfo: (workspaceSlug: string, projectId: string) => Promise<IProjectMember | undefined>;
  fetchUserProjectPermissions: (workspaceSlug: string) => Promise<IUserProjectsRole | undefined>;
  joinProject: (workspaceSlug: string, projectId: string) => Promise<void | undefined>;
  leaveProject: (workspaceSlug: string, projectId: string) => Promise<void>;
}

export class UserPermissionStore implements IUserPermissionStore {
  // constants
  workspaceUserInfo: Record<string, IWorkspaceMemberMe> = {};
  projectUserInfo: Record<string, Record<string, IProjectMember>> = {};
  projectPermissions: Record<string, IUserProjectsRole> = {};
  // observables

  constructor(private store: CoreRootStore) {
    makeObservable(this, {
      // observables
      workspaceUserInfo: observable,
      projectUserInfo: observable,
      projectPermissions: observable,
      // computed
      // actions
      fetchUserWorkspaceInfo: action,
      leaveWorkspace: action,
      fetchUserProjectInfo: action,
      fetchUserProjectPermissions: action,
      joinProject: action,
      leaveProject: action,
    });
  }

  // computed

  // computed helpers
  /**
   * @description Returns the current workspace information
   * @param { string } workspaceSlug
   * @returns { IWorkspaceMemberMe | undefined }
   */
  workspaceInfoBySlug = computedFn((workspaceSlug: string): IWorkspaceMemberMe | undefined => {
    if (!workspaceSlug) return undefined;
    return this.workspaceUserInfo[workspaceSlug] || undefined;
  });

  /**
   * @description Returns the current project permissions
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { IUserProjectsRole | undefined }
   */
  projectPermissionsByWorkspaceSlugAndProjectId = computedFn(
    (workspaceSlug: string, projectId: string): IUserProjectsRole | undefined => {
      if (!workspaceSlug || !projectId) return undefined;
      return this.projectPermissions?.[workspaceSlug]?.[projectId] || undefined;
    }
  );

  /**
   * @description Returns whether the user has the permission to perform an action
   * @param { TUserPermissions[] } allowPermissions
   * @param { TUserPermissionsLevel } level
   * @param { () => boolean } onPermissionAllowed
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { boolean }
   */
  allowPermissions = computedFn(
    (
      allowPermissions: TUserPermissions[],
      level: TUserPermissionsLevel,
      onPermissionAllowed?: () => boolean,
      workspaceSlug?: string,
      projectId?: string
    ) => {
      const { workspaceSlug: currentWorkspaceSlug, projectId: currentProjectId } = this.store.router;
      if (!workspaceSlug) workspaceSlug = currentWorkspaceSlug;
      if (!projectId) projectId = currentProjectId;

      let currentUserRole: EUserPermissions | undefined = undefined;

      if (level === EUserPermissionsLevel.WORKSPACE) {
        const workspaceInfoBySlug = workspaceSlug && this.workspaceInfoBySlug(workspaceSlug);
        if (workspaceInfoBySlug) {
          currentUserRole = workspaceInfoBySlug?.role as unknown as EUserPermissions;
        }
      }

      if (level === EUserPermissionsLevel.PROJECT) {
        currentUserRole = (workspaceSlug &&
          projectId &&
          this.projectPermissionsByWorkspaceSlugAndProjectId(workspaceSlug, projectId)) as EUserPermissions | undefined;
      }

      if (currentUserRole && allowPermissions.includes(currentUserRole)) {
        if (onPermissionAllowed) {
          return onPermissionAllowed();
        } else {
          return true;
        }
      }

      return false;
    }
  );

  // action helpers

  // actions
  /**
   * @description Fetches the user's workspace information
   * @param { string } workspaceSlug
   * @returns { Promise<void | undefined> }
   */
  fetchUserWorkspaceInfo = async (workspaceSlug: string): Promise<IWorkspaceMemberMe | undefined> => {
    try {
      const response = await workspaceService.workspaceMemberMe(workspaceSlug);
      if (response) {
        runInAction(() => {
          set(this.workspaceUserInfo, [workspaceSlug], response);
        });
      }
      return response;
    } catch (error) {
      console.error("Error fetching user workspace information", error);
      throw error;
    }
  };

  /**
   * @description Leaves a workspace
   * @param { string } workspaceSlug
   * @returns { Promise<void | undefined> }
   */
  leaveWorkspace = async (workspaceSlug: string): Promise<void> => {
    try {
      await userService.leaveWorkspace(workspaceSlug);
      runInAction(() => {
        unset(this.workspaceUserInfo, workspaceSlug);
        unset(this.projectUserInfo, workspaceSlug);
        unset(this.projectPermissions, workspaceSlug);
      });
    } catch (error) {
      console.error("Error user leaving the workspace", error);
      throw error;
    }
  };

  /**
   * @description Fetches the user's project information
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { Promise<void | undefined> }
   */
  fetchUserProjectInfo = async (workspaceSlug: string, projectId: string): Promise<IProjectMember | undefined> => {
    try {
      const response = await projectMemberService.projectMemberMe(workspaceSlug, projectId);
      if (response) {
        runInAction(() => {
          set(this.projectUserInfo, [workspaceSlug, projectId], response);
          set(this.projectPermissions, [workspaceSlug, projectId], response.role);
        });
      }
      return response;
    } catch (error) {
      console.error("Error fetching user project information", error);
      throw error;
    }
  };

  /**
   * @description Fetches the user's project permissions
   * @param { string } workspaceSlug
   * @returns { Promise<void | undefined> }
   */
  fetchUserProjectPermissions = async (workspaceSlug: string): Promise<IUserProjectsRole | undefined> => {
    try {
      const response = await workspaceService.getWorkspaceUserProjectsRole(workspaceSlug);
      runInAction(() => {
        set(this.projectPermissions, [workspaceSlug], response);
      });
      return response;
    } catch (error) {
      console.error("Error fetching user project permissions", error);
      throw error;
    }
  };

  /**
   * @description Joins a project
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { Promise<void | undefined> }
   */
  joinProject = async (workspaceSlug: string, projectId: string): Promise<void | undefined> => {
    try {
      const response = await userService.joinProject(workspaceSlug, [projectId]);
      if (response) {
        runInAction(() => {
          set(this.projectPermissions, [workspaceSlug, projectId], response);
        });
      }
      return response;
    } catch (error) {
      console.error("Error user joining the project", error);
      throw error;
    }
  };

  /**
   * @description Leaves a project
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { Promise<void | undefined> }
   */
  leaveProject = async (workspaceSlug: string, projectId: string): Promise<void> => {
    try {
      await userService.leaveProject(workspaceSlug, projectId);
      runInAction(() => {
        unset(this.projectPermissions, [workspaceSlug, projectId]);
      });
    } catch (error) {
      console.error("Error user leaving the project", error);
      throw error;
    }
  };
}
