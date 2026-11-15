import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { sortDefinitions, type CustomFieldAppliesTo, type CustomFieldDef } from '@/lib/custom-fields';

/**
 * Every field a project sees for `appliesTo` (global first, then the project's own).
 * Without a project only the global fields exist (a task outside any project, a project being created).
 * Query keys all start with 'custom-fields', so one invalidation refreshes every list.
 */
export function useCustomFieldDefs(projectId?: string | null, appliesTo: CustomFieldAppliesTo = 'task') {
  return useQuery({
    queryKey: projectId ? ['custom-fields', projectId, appliesTo] : ['custom-fields', 'global', appliesTo],
    queryFn: async () => {
      const url = projectId ? `/projects/${projectId}/custom-fields` : '/custom-fields';
      return sortDefinitions((await api.get(url, { params: { applies_to: appliesTo } })).data as CustomFieldDef[]);
    },
  });
}

/** The global fields only (superuser settings, the projects list). */
export function useGlobalFieldDefs(appliesTo: CustomFieldAppliesTo) {
  return useCustomFieldDefs(null, appliesTo);
}
