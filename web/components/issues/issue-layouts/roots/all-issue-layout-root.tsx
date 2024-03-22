import React, { Fragment, useCallback } from "react";
import isEmpty from "lodash/isEmpty";
import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import useSWR from "swr";
// hooks
import { useWorkspaceIssueProperties } from "hooks/use-workspace-issue-properties";
import { useApplication, useEventTracker, useGlobalView, useIssues, useProject, useUser } from "hooks/store";
import { useIssuesActions } from "hooks/use-issues-actions";
// components
import { GlobalViewsAppliedFiltersRoot, IssuePeekOverview } from "components/issues";
import { SpreadsheetView } from "components/issues/issue-layouts";
import { AllIssueQuickActions } from "components/issues/issue-layouts/quick-action-dropdowns";
import { EmptyState } from "components/empty-state";
import { SpreadsheetLayoutLoader } from "components/ui";
// types
import { TIssue, IIssueDisplayFilterOptions } from "@plane/types";
// constants
import { EUserProjectRoles } from "constants/project";
import {
  EIssueFilterType,
  EIssueLayoutTypes,
  EIssuesStoreType,
  ISSUE_DISPLAY_FILTERS_BY_LAYOUT,
} from "constants/issue";
import { EMPTY_STATE_DETAILS, EmptyStateType } from "constants/empty-state";
import { ALL_ISSUES } from "store/issue/helpers/base-issues.store";
import { IssueLayoutHOC } from "../issue-layout-HOC";

export const AllIssueLayoutRoot: React.FC = observer(() => {
  // router
  const router = useRouter();
  const { workspaceSlug, globalViewId, ...routeFilters } = router.query;
  //swr hook for fetching issue properties
  useWorkspaceIssueProperties(workspaceSlug);
  // store
  const { commandPalette: commandPaletteStore } = useApplication();
  const {
    issuesFilter: { filters, fetchFilters, updateFilters },
    issues: { loader, getPaginationData, groupedIssueIds, fetchIssues, fetchNextIssues },
  } = useIssues(EIssuesStoreType.GLOBAL);
  const { updateIssue, removeIssue, archiveIssue } = useIssuesActions(EIssuesStoreType.GLOBAL);

  const {
    membership: { currentWorkspaceAllProjectsRole },
  } = useUser();
  const { fetchAllGlobalViews } = useGlobalView();
  const { workspaceProjectIds } = useProject();
  const { setTrackElement } = useEventTracker();
  // filter init from the query params

  const routerFilterParams = () => {
    if (
      workspaceSlug &&
      globalViewId &&
      ["all-issues", "assigned", "created", "subscribed"].includes(globalViewId.toString())
    ) {
      let issueFilters: any = {};
      Object.keys(routeFilters).forEach((key) => {
        const filterKey: any = key;
        const filterValue = routeFilters[key]?.toString() || undefined;
        if (
          ISSUE_DISPLAY_FILTERS_BY_LAYOUT.my_issues.spreadsheet.filters.includes(filterKey) &&
          filterKey &&
          filterValue
        )
          issueFilters = { ...issueFilters, [filterKey]: filterValue.split(",") };
      });

      if (!isEmpty(routeFilters))
        updateFilters(
          workspaceSlug.toString(),
          undefined,
          EIssueFilterType.FILTERS,
          issueFilters,
          globalViewId.toString()
        );
    }
  };

  const fetchNextPages = useCallback(() => {
    if (workspaceSlug && globalViewId) fetchNextIssues(workspaceSlug.toString(), globalViewId.toString());
  }, [fetchNextIssues, workspaceSlug, globalViewId]);

  useSWR(
    workspaceSlug ? `WORKSPACE_GLOBAL_VIEWS_${workspaceSlug}` : null,
    async () => {
      if (workspaceSlug) {
        await fetchAllGlobalViews(workspaceSlug.toString());
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  useSWR(
    workspaceSlug && globalViewId ? `WORKSPACE_GLOBAL_VIEW_ISSUES_${workspaceSlug}_${globalViewId}` : null,
    async () => {
      if (workspaceSlug && globalViewId) {
        await fetchAllGlobalViews(workspaceSlug.toString());
        await fetchFilters(workspaceSlug.toString(), globalViewId.toString());
        await fetchIssues(
          workspaceSlug.toString(),
          globalViewId.toString(),
          groupedIssueIds ? "mutation" : "init-loader",
          {
            canGroup: false,
            perPageCount: 100,
          }
        );
        routerFilterParams();
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const canEditProperties = useCallback(
    (projectId: string | undefined) => {
      if (!projectId) return false;

      const currentProjectRole = currentWorkspaceAllProjectsRole && currentWorkspaceAllProjectsRole[projectId];

      return !!currentProjectRole && currentProjectRole >= EUserProjectRoles.MEMBER;
    },
    [currentWorkspaceAllProjectsRole]
  );

  const issueFilters = globalViewId ? filters?.[globalViewId.toString()] : undefined;

  const handleDisplayFiltersUpdate = useCallback(
    (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => {
      if (!workspaceSlug || !globalViewId) return;

      updateFilters(
        workspaceSlug.toString(),
        undefined,
        EIssueFilterType.DISPLAY_FILTERS,
        { ...updatedDisplayFilter },
        globalViewId.toString()
      );
    },
    [updateFilters, workspaceSlug, globalViewId]
  );

  const renderQuickActions = useCallback(
    (issue: TIssue, customActionButton?: React.ReactElement, portalElement?: HTMLDivElement | null) => (
      <AllIssueQuickActions
        customActionButton={customActionButton}
        issue={issue}
        handleDelete={async () => removeIssue(issue.project_id, issue.id)}
        handleUpdate={async (data) => updateIssue && updateIssue(issue.project_id, issue.id, data)}
        handleArchive={async () => archiveIssue && archiveIssue(issue.project_id, issue.id)}
        portalElement={portalElement}
        readOnly={!canEditProperties(issue.project_id ?? undefined)}
      />
    ),
    [canEditProperties, removeIssue, updateIssue, archiveIssue]
  );

  if (loader === "init-loader" || !globalViewId || !groupedIssueIds) {
    return <SpreadsheetLayoutLoader />;
  }

  const issueIds = groupedIssueIds[ALL_ISSUES];
  const nextPageResults = getPaginationData(ALL_ISSUES)?.nextPageResults;

  const emptyStateType =
    (workspaceProjectIds ?? []).length > 0 ? `workspace-${globalViewId}` : EmptyStateType.WORKSPACE_NO_PROJECTS;

  return (
    <IssueLayoutHOC storeType={EIssuesStoreType.GLOBAL} layout={EIssueLayoutTypes.SPREADSHEET}>
      <SpreadsheetView
        displayProperties={issueFilters?.displayProperties ?? {}}
        displayFilters={issueFilters?.displayFilters ?? {}}
        handleDisplayFilterUpdate={handleDisplayFiltersUpdate}
        issueIds={Array.isArray(issueIds) ? issueIds : []}
        quickActions={renderQuickActions}
        updateIssue={updateIssue}
        canEditProperties={canEditProperties}
        viewId={globalViewId.toString()}
        canLoadMoreIssues={!!nextPageResults}
        loadMoreIssues={fetchNextPages}
      />
      {/* peek overview */}
      <IssuePeekOverview />
    </IssueLayoutHOC>
  );
});
