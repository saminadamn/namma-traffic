"""
Admin-only user and role management.

Every route requires an explicit permission via require_permission(...)
— deliberately no 'is_admin' shortcut. That means a future role like
'support_staff' could be granted just 'user:list' without inheriting
'role:assign', because the two are checked independently, not bundled
behind one boolean flag.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from core.database import get_db
from core.rbac import require_permission
from db_models.user import Role, User
from schemas.auth import AssignRoleRequest, RoleOut, UserOut
from services import auth_service

router = APIRouter()


def _user_to_out(user: User) -> UserOut:
    return UserOut(
        id=str(user.id), phone_number=user.phone_number, email=user.email,
        full_name=user.full_name, is_active=user.is_active,
        roles=user.role_names(), permissions=sorted(user.permission_codes()),
    )


@router.get(
    "/users",
    response_model=list[UserOut],
    dependencies=[Depends(require_permission("user:list"))],
)
def list_users(db=Depends(get_db), limit: int = Query(50, le=200), offset: int = Query(0, ge=0)):
    users = db.query(User).order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    return [_user_to_out(u) for u in users]


@router.get(
    "/roles",
    response_model=list[RoleOut],
    dependencies=[Depends(require_permission("user:list"))],
)
def list_roles(db=Depends(get_db)):
    return db.query(Role).order_by(Role.id).all()


@router.post(
    "/users/{user_id}/roles",
    response_model=UserOut,
    dependencies=[Depends(require_permission("role:assign"))],
)
def assign_role(user_id: UUID, body: AssignRoleRequest, db=Depends(get_db)):
    user = auth_service.assign_role(db, str(user_id), body.role_name)
    return _user_to_out(user)
