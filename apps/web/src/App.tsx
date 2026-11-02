// Định tuyến: đăng nhập, đổi mật khẩu, khu học viên / giảng viên / admin (admin dùng được cả khu giảng viên).
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { HomeRedirect, RequireAuth, RequireRole } from './auth.js';
import { Layout } from './components/Layout.js';
import { Loading } from './components/ui.js';
import { AuditPage } from './pages/admin/AuditPage.js';
import { HarnessPage } from './pages/admin/HarnessPage.js';
import { UsersPage } from './pages/admin/UsersPage.js';
import { ChangePasswordPage } from './pages/ChangePasswordPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { StudentAssignmentDetailPage } from './pages/student/AssignmentDetailPage.js';
import { StudentAssignmentsPage } from './pages/student/AssignmentsPage.js';
import { AssignmentFormPage } from './pages/teacher/AssignmentFormPage.js';
import { TeacherAssignmentsPage } from './pages/teacher/AssignmentsPage.js';
import { ClassesPage } from './pages/teacher/ClassesPage.js';
import { SubmissionDetailPage } from './pages/teacher/SubmissionDetailPage.js';
import { SubmissionsPage } from './pages/teacher/SubmissionsPage.js';
import { TeacherSection } from './pages/teacher/TeacherSection.js';

// Trang chi tiết lớp dùng parseStudentCsv (kéo theo zod) — tách chunk riêng để bundle chính nhẹ.
const ClassDetailPage = lazy(() => import('./pages/teacher/ClassDetailPage.js').then((m) => ({ default: m.ClassDetailPage })));

export function App() {
  return (
    <Routes>
      <Route path="/dang-nhap" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/doi-mat-khau" element={<ChangePasswordPage />} />
        <Route index element={<HomeRedirect />} />
        <Route element={<Layout />}>
          <Route path="/hoc-vien" element={<RequireRole roles={['student']} />}>
            <Route index element={<StudentAssignmentsPage />} />
            <Route path="bai-tap/:id" element={<StudentAssignmentDetailPage />} />
          </Route>
          <Route path="/giang-vien" element={<RequireRole roles={['teacher', 'admin']} />}>
            <Route element={<TeacherSection />}>
              <Route index element={<Navigate to="lop-hoc" replace />} />
              <Route path="lop-hoc" element={<ClassesPage />} />
              <Route
                path="lop-hoc/:id"
                element={
                  <Suspense fallback={<Loading />}>
                    <ClassDetailPage />
                  </Suspense>
                }
              />
              <Route path="de-bai" element={<TeacherAssignmentsPage />} />
              <Route path="de-bai/moi" element={<AssignmentFormPage />} />
              <Route path="de-bai/:id" element={<SubmissionsPage />} />
              <Route path="de-bai/:id/sua" element={<AssignmentFormPage />} />
              <Route path="bai-nop/:id" element={<SubmissionDetailPage />} />
            </Route>
          </Route>
          <Route path="/admin" element={<RequireRole roles={['admin']} />}>
            <Route index element={<Navigate to="tai-khoan" replace />} />
            <Route path="tai-khoan" element={<UsersPage />} />
            <Route path="nhat-ky" element={<AuditPage />} />
            <Route path="harness" element={<HarnessPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
