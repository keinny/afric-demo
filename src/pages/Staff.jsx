import { useState } from 'react';
import { DEPARTMENTS, ROLES, can } from '../config';
import { fmtDate } from '../finance';
import { useStore } from '../store';
import { Card, Empty, Field, Icon, Modal } from '../ui';

const PERMS = {
  customer: 'Register customers',
  apply: 'Capture applications',
  verify: 'Verify documents',
  decide: 'Approve / reject',
  disburse: 'Disburse loans',
  payment: 'Record & reconcile payments',
};
const permText = (roleKey) => {
  const c = ROLES[roleKey]?.can || [];
  return c.includes('*') ? 'Full access to every module' : c.length ? c.map((p) => PERMS[p]).join(', ') : 'View-only (dashboards & reports)';
};

export default function Staff() {
  const { state, dispatch } = useStore();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('All');
  const [editing, setEditing] = useState(null); // 'new' or a staff id
  const isAdmin = can(state.role, '*');
  const staff = state.staff || [];

  const rows = staff
    .filter((s) => dept === 'All' || s.department === dept)
    .filter((s) => `${s.name} ${s.email} ${s.designation} ${s.id}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="page">
      <section className="card emi-head">
        <div className="emi-head-top">
          <div>
            <h2 className="with-icon"><Icon name="users" size={20} /> Staff & Role-Based Access Control (RBAC)</h2>
            <p className="muted">Internal staff, departments and the system permissions each role carries.</p>
          </div>
          {isAdmin && <button className="btn dark" onClick={() => setEditing('new')}>+ Add Staff Member</button>}
        </div>
        <div className="toolbar-inline">
          <div className="search">
            <span aria-hidden>⌕</span>
            <input placeholder="Search by name, email, designation, code…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="filter">
            <span className="muted small">Department</span>
            <select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="All">All Departments</option>
              {DEPARTMENTS.map((d) => <option key={d.name}>{d.name}</option>)}
            </select>
          </label>
        </div>
        {!isAdmin && <p className="muted small mt8">Only the Super Admin can add, edit or deactivate staff.</p>}
      </section>

      <Card className="flush">
        {rows.length ? (
          <div className="table-wrap">
            <table className="apps compact">
              <thead>
                <tr><th>Staff code</th><th>Name</th><th>Contact</th><th>Department</th><th>Designation</th><th>Assigned role</th><th>Joining date</th><th>Status</th><th className="right">Actions</th></tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className={s.active ? '' : 'row-inactive'}>
                    <td className="mono strong">{s.id}</td>
                    <td><strong>{s.name}</strong></td>
                    <td>{s.email}<div className="mono muted small">{s.phone}</div></td>
                    <td className="upper small">{s.department}</td>
                    <td className="wrap-sm">{s.designation}</td>
                    <td><span className="role-chip" title={permText(s.roleKey)}>{ROLES[s.roleKey]?.label}</span></td>
                    <td className="muted">{fmtDate(s.joined)}</td>
                    <td><span className={`status-tag ${s.active ? 'ok' : 'bad'}`}>{s.active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                    <td className="right">
                      {isAdmin ? (
                        <div className="link-stack">
                          <button className="link ink" onClick={() => setEditing(s.id)}>Edit</button>
                          <button className="link muted" onClick={() => dispatch({ type: 'toggleStaff', id: s.id })}>{s.active ? 'Deactivate' : 'Activate'}</button>
                        </div>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No staff match these filters.</Empty>
        )}
      </Card>

      <Card title="Role permissions" sub="What each RBAC role can do in the system">
        <div className="metric-grid">
          {Object.entries(ROLES).map(([k, r]) => (
            <div key={k}>
              <span>{r.label}</span>
              <strong className="perm">{permText(k)}</strong>
            </div>
          ))}
        </div>
      </Card>

      {editing && <StaffForm id={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StaffForm({ id, onClose }) {
  const { state, dispatch } = useStore();
  const existing = id ? state.staff.find((s) => s.id === id) : null;
  const [f, setF] = useState(
    existing || { name: '', email: '', phone: '+260 97', department: 'Loan Origination', roleKey: 'officer', designation: 'Loan Officer', active: true }
  );
  const set = (k) => (e) => setF({ ...f, [k]: k === 'active' ? e.target.value === 'true' : e.target.value });
  const ok = f.name.trim().length > 2 && /\S+@\S+\.\S+/.test(f.email) && f.phone.trim().length > 7 && f.designation.trim();

  const submit = (e) => {
    e.preventDefault();
    if (!ok) return;
    if (existing) {
      const { id: _id, joined, ...changes } = f;
      dispatch({ type: 'updateStaff', id, changes });
    } else {
      dispatch({ type: 'addStaff', staff: f });
    }
    onClose();
  };

  return (
    <Modal title={existing ? `Edit ${existing.id}` : 'Add Staff Member'} sub="Department, role permissions and contact details" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Full legal name *"><input value={f.name} onChange={set('name')} placeholder="e.g. Kondwani Banda" autoFocus /></Field>
        <div className="row">
          <Field label="Work email *"><input type="email" value={f.email} onChange={set('email')} placeholder="k.banda@africo.demo" /></Field>
          <Field label="Phone number *"><input value={f.phone} onChange={set('phone')} /></Field>
        </div>
        <div className="row">
          <Field label="Department">
            <select value={f.department} onChange={set('department')}>
              {DEPARTMENTS.map((d) => <option key={d.name}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Assigned RBAC role *">
            <select value={f.roleKey} onChange={set('roleKey')}>
              {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
            </select>
          </Field>
        </div>
        <p className="muted small">Permissions: {permText(f.roleKey)}</p>
        <Field label="Job designation *"><input value={f.designation} onChange={set('designation')} /></Field>
        <Field label="Status">
          <select value={String(f.active)} onChange={set('active')}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </Field>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn dark" disabled={!ok}>{existing ? 'Save changes' : 'Create Staff Profile'}</button>
        </div>
      </form>
    </Modal>
  );
}
