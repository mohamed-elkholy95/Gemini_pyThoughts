// Teams & Permissions Routes
// Manage team collaboration and access control

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { requireAuth, type AuthContext } from '../middleware/auth.js';
import { permissionsService, type Role, type ResourceType, type Permission } from '../services/permissions.service.js';

export const teamsRouter = new Hono<AuthContext>();

// ============ Team Management ============

// Create a new team
teamsRouter.post(
  '/',
  requireAuth,
  zValidator(
    'json',
    z.object({
      name: z.string().min(2).max(100),
      description: z.string().max(500).optional(),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const { name, description } = c.req.valid('json');

    const team = await permissionsService.createTeam(user.id, name, description);

    return c.json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        description: team.description,
        settings: team.settings,
        createdAt: team.createdAt.toISOString(),
      },
    }, 201);
  }
);

// Get user's teams
teamsRouter.get('/', requireAuth, async (c) => {
  const user = c.get('user')!;

  const teams = await permissionsService.getUserTeams(user.id);

  return c.json({
    success: true,
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      slug: team.slug,
      description: team.description,
      isOwner: team.ownerId === user.id,
      createdAt: team.createdAt.toISOString(),
    })),
  });
});

// Get team by ID
teamsRouter.get('/:teamId', requireAuth, async (c) => {
  const user = c.get('user')!;
  const teamId = c.req.param('teamId');

  const team = await permissionsService.getTeam(teamId);
  if (!team) {
    return c.json({ error: 'Team not found' }, 404);
  }

  // Check if user is a member
  const members = await permissionsService.getTeamMembers(teamId);
  const isMember = members.some((m) => m.userId === user.id);

  if (!isMember) {
    return c.json({ error: 'Access denied' }, 403);
  }

  const userMember = members.find((m) => m.userId === user.id);

  return c.json({
    success: true,
    team: {
      id: team.id,
      name: team.name,
      slug: team.slug,
      description: team.description,
      isOwner: team.ownerId === user.id,
      myRole: userMember?.role,
      settings: team.settings,
      memberCount: members.filter((m) => m.status === 'active').length,
      createdAt: team.createdAt.toISOString(),
    },
  });
});

// Update team settings
teamsRouter.patch(
  '/:teamId/settings',
  requireAuth,
  zValidator(
    'json',
    z.object({
      allowPublicJoin: z.boolean().optional(),
      defaultRole: z.enum(['contributor', 'author', 'editor']).optional(),
      requireApproval: z.boolean().optional(),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const teamId = c.req.param('teamId');
    const settings = c.req.valid('json');

    const team = await permissionsService.updateTeamSettings(teamId, user.id, settings);
    if (!team) {
      return c.json({ error: 'Team not found or permission denied' }, 404);
    }

    return c.json({
      success: true,
      settings: team.settings,
    });
  }
);

// Delete team
teamsRouter.delete('/:teamId', requireAuth, async (c) => {
  const user = c.get('user')!;
  const teamId = c.req.param('teamId');

  const deleted = await permissionsService.deleteTeam(teamId, user.id);
  if (!deleted) {
    return c.json({ error: 'Team not found or permission denied' }, 404);
  }

  return c.json({ success: true });
});

// ============ Team Members ============

// Get team members
teamsRouter.get('/:teamId/members', requireAuth, async (c) => {
  const user = c.get('user')!;
  const teamId = c.req.param('teamId');

  // Check if user is a member
  const members = await permissionsService.getTeamMembers(teamId);
  const isMember = members.some((m) => m.userId === user.id);

  if (!isMember) {
    return c.json({ error: 'Access denied' }, 403);
  }

  return c.json({
    success: true,
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      roleInfo: permissionsService.getRoleInfo(m.role),
      status: m.status,
      invitedAt: m.invitedAt.toISOString(),
      acceptedAt: m.acceptedAt?.toISOString() || null,
    })),
  });
});

// Invite member to team
teamsRouter.post(
  '/:teamId/members',
  requireAuth,
  zValidator(
    'json',
    z.object({
      email: z.string().email(),
      role: z.enum(['admin', 'editor', 'author', 'contributor', 'viewer']),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const teamId = c.req.param('teamId');
    const { email, role } = c.req.valid('json');

    const result = await permissionsService.inviteMember(teamId, user.id, email, role as Role);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({
      success: true,
      member: {
        id: result.member!.id,
        role: result.member!.role,
        status: result.member!.status,
        invitedAt: result.member!.invitedAt.toISOString(),
      },
    }, 201);
  }
);

// Accept team invitation
teamsRouter.post('/:teamId/accept', requireAuth, async (c) => {
  const user = c.get('user')!;
  const teamId = c.req.param('teamId');

  const accepted = await permissionsService.acceptInvitation(teamId, user.id);
  if (!accepted) {
    return c.json({ error: 'No pending invitation found' }, 404);
  }

  return c.json({ success: true });
});

// Update member role
teamsRouter.patch(
  '/:teamId/members/:memberId',
  requireAuth,
  zValidator(
    'json',
    z.object({
      role: z.enum(['admin', 'editor', 'author', 'contributor', 'viewer']),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const teamId = c.req.param('teamId');
    const memberId = c.req.param('memberId');
    const { role } = c.req.valid('json');

    const updated = await permissionsService.updateMemberRole(teamId, user.id, memberId, role as Role);
    if (!updated) {
      return c.json({ error: 'Member not found or permission denied' }, 404);
    }

    return c.json({ success: true });
  }
);

// Remove member from team
teamsRouter.delete('/:teamId/members/:memberId', requireAuth, async (c) => {
  const user = c.get('user')!;
  const teamId = c.req.param('teamId');
  const memberId = c.req.param('memberId');

  const removed = await permissionsService.removeMember(teamId, user.id, memberId);
  if (!removed) {
    return c.json({ error: 'Member not found or permission denied' }, 404);
  }

  return c.json({ success: true });
});

// Leave team (remove self)
teamsRouter.post('/:teamId/leave', requireAuth, async (c) => {
  const user = c.get('user')!;
  const teamId = c.req.param('teamId');

  const removed = await permissionsService.removeMember(teamId, user.id, user.id);
  if (!removed) {
    return c.json({ error: 'Cannot leave team (owner cannot leave)' }, 400);
  }

  return c.json({ success: true });
});

// ============ Permissions ============

// Check if user has permission
teamsRouter.get('/permissions/check', requireAuth, async (c) => {
  const user = c.get('user')!;
  const resourceType = c.req.query('resourceType') as ResourceType;
  const permission = c.req.query('permission') as Permission;
  const resourceId = c.req.query('resourceId');

  if (!resourceType || !permission) {
    return c.json({ error: 'resourceType and permission are required' }, 400);
  }

  const hasPermission = await permissionsService.hasPermission(
    user.id,
    resourceType,
    permission,
    resourceId
  );

  return c.json({
    success: true,
    hasPermission,
    resourceType,
    permission,
    resourceId: resourceId || null,
  });
});

// Get user's permissions on a resource
teamsRouter.get('/permissions/resource', requireAuth, async (c) => {
  const user = c.get('user')!;
  const resourceType = c.req.query('resourceType') as ResourceType;
  const resourceId = c.req.query('resourceId');

  if (!resourceType) {
    return c.json({ error: 'resourceType is required' }, 400);
  }

  const permissions = await permissionsService.getUserPermissions(
    user.id,
    resourceType,
    resourceId
  );

  return c.json({
    success: true,
    permissions,
    resourceType,
    resourceId: resourceId || null,
  });
});

// Grant permission on resource
teamsRouter.post(
  '/permissions/grant',
  requireAuth,
  zValidator(
    'json',
    z.object({
      userId: z.string(),
      resourceType: z.enum(['draft', 'series', 'readingList', 'team', 'settings', 'analytics', 'newsletter']),
      resourceId: z.string(),
      permission: z.enum([
        'create', 'read', 'update', 'delete', 'publish', 'unpublish',
        'manage_team', 'manage_settings', 'view_analytics', 'manage_newsletter',
        'moderate', 'export',
      ]),
      expiresAt: z.string().datetime().optional(),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const { userId, resourceType, resourceId, permission, expiresAt } = c.req.valid('json');

    const granted = await permissionsService.grantPermission(
      user.id,
      userId,
      resourceType as ResourceType,
      resourceId,
      permission as Permission,
      expiresAt ? new Date(expiresAt) : undefined
    );

    if (!granted) {
      return c.json({ error: 'Cannot grant permission (insufficient permissions)' }, 403);
    }

    return c.json({ success: true });
  }
);

// Revoke permission on resource
teamsRouter.post(
  '/permissions/revoke',
  requireAuth,
  zValidator(
    'json',
    z.object({
      userId: z.string(),
      resourceType: z.enum(['draft', 'series', 'readingList', 'team', 'settings', 'analytics', 'newsletter']),
      resourceId: z.string(),
      permission: z.enum([
        'create', 'read', 'update', 'delete', 'publish', 'unpublish',
        'manage_team', 'manage_settings', 'view_analytics', 'manage_newsletter',
        'moderate', 'export',
      ]),
    })
  ),
  async (c) => {
    const user = c.get('user')!;
    const { userId, resourceType, resourceId, permission } = c.req.valid('json');

    const revoked = await permissionsService.revokePermission(
      user.id,
      userId,
      resourceType as ResourceType,
      resourceId,
      permission as Permission
    );

    if (!revoked) {
      return c.json({ error: 'Permission not found' }, 404);
    }

    return c.json({ success: true });
  }
);

// Get all available roles
teamsRouter.get('/roles', requireAuth, async (c) => {
  const roles = permissionsService.getAllRoles();

  return c.json({
    success: true,
    roles: roles.map((role) => ({
      id: role,
      ...permissionsService.getRoleInfo(role),
      permissions: permissionsService.getRolePermissions(role),
    })),
  });
});

// Get role details
teamsRouter.get('/roles/:role', requireAuth, async (c) => {
  const role = c.req.param('role') as Role;
  const roles = permissionsService.getAllRoles();

  if (!roles.includes(role)) {
    return c.json({ error: 'Role not found' }, 404);
  }

  return c.json({
    success: true,
    role: {
      id: role,
      ...permissionsService.getRoleInfo(role),
      permissions: permissionsService.getRolePermissions(role),
    },
  });
});
