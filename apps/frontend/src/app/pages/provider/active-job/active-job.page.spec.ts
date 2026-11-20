import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ActiveJobPage } from './active-job.page';
import { JobStatus, ProviderActiveJob } from '../../../interfaces/request.interface';

describe('ActiveJobPage completion', () => {
  const job: ProviderActiveJob = {
    id: 'job_123', requestId: '123', clientName: 'Cliente',
    clientLocation: { latitude: 41.18, longitude: 1.45 },
    categoryName: 'Taxi', description: 'Viaje',
    status: JobStatus.ON_SITE, acceptedAt: new Date()
  };

  function pageWith(postResult: Observable<unknown>) {
    const router = { navigate: jasmine.createSpy().and.resolveTo(true) };
    const toast = { create: jasmine.createSpy().and.resolveTo({ present: () => Promise.resolve() }) };
    const http = { post: jasmine.createSpy().and.returnValue(postResult) };
    const workspace = {
      updateActiveJob: jasmine.createSpy(), completeActiveJob: jasmine.createSpy(),
      fetchAcceptedJob: jasmine.createSpy().and.resolveTo(true),
      getActiveJob: jasmine.createSpy().and.returnValue(job),
      ensureBelongsTo: jasmine.createSpy(), activeJob$: of(job)
    };
    const page = new ActiveJobPage(router as any, {} as any, toast as any, http as any, workspace as any,
      { currentUser: { email: 'provider@example.test' } } as any);
    page.activeJob = { ...job };
    return { page, router, toast, http, workspace };
  }

  it('closes the local job only after the backend confirms completion', async () => {
    const { page, http, workspace, router } = pageWith(of({ success: true }));
    await (page as any).completeJob();
    expect(http.post).toHaveBeenCalledWith(jasmine.stringMatching(/\/providers\/guest-requests\/123\/complete$/), {});
    expect(workspace.completeActiveJob).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/provider/home']);
  });

  it('binds locally saved work to the signed-in provider on direct entry', () => {
    const { page, workspace } = pageWith(of({ success: true }));
    page.ngOnInit();
    expect(workspace.ensureBelongsTo).toHaveBeenCalledWith('provider@example.test');
    expect(workspace.fetchAcceptedJob).toHaveBeenCalled();
  });

  it('keeps the job active when the backend rejects completion', async () => {
    const { page, workspace, router } = pageWith(throwError(() => new Error('Network error')));
    spyOn(console, 'error');
    await (page as any).completeJob();
    expect(workspace.completeActiveJob).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(page.activeJob?.status).toBe(JobStatus.ON_SITE);
  });

  it('does not complete a locally saved job no longer accepted for this provider', async () => {
    const { page, http, toast, workspace, router } = pageWith(of({ success: true }));
    workspace.getActiveJob.and.returnValue(null);

    await (page as any).completeJob();

    expect(http.post).not.toHaveBeenCalled();
    expect(workspace.completeActiveJob).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/provider/home']);
    expect(toast.create).toHaveBeenCalledWith(jasmine.objectContaining({
      message: jasmine.stringMatching(/ya no figura como aceptado/), color: 'warning'
    }));
    expect(page.isCompleting).toBeFalse();
  });

  it('keeps the local job when the server check fails', async () => {
    const { page, http, toast, workspace } = pageWith(of({ success: true }));
    workspace.fetchAcceptedJob.and.resolveTo(false);

    await (page as any).completeJob();

    expect(http.post).not.toHaveBeenCalled();
    expect(workspace.completeActiveJob).not.toHaveBeenCalled();
    expect(toast.create).toHaveBeenCalledWith(jasmine.objectContaining({ color: 'danger' }));
    expect(page.isCompleting).toBeFalse();
  });

  it('explains when the backend request is not accepted yet', async () => {
    const error = new HttpErrorResponse({ status: 409 });
    const { page, toast, workspace } = pageWith(throwError(() => error));
    spyOn(console, 'error');

    await (page as any).completeJob();

    expect(workspace.completeActiveJob).not.toHaveBeenCalled();
    expect(toast.create).toHaveBeenCalledWith(jasmine.objectContaining({
      message: jasmine.stringMatching(/todavía no consta como aceptada/), color: 'danger'
    }));
  });

  it('does not report a backend failure when only local history fails', async () => {
    const { page, toast, workspace } = pageWith(of({ success: true }));
    workspace.completeActiveJob.and.throwError('Storage full');
    spyOn(console, 'error');

    await (page as any).completeJob();

    expect(page.activeJob?.status).toBe(JobStatus.COMPLETED);
    expect(toast.create).toHaveBeenCalledWith(jasmine.objectContaining({
      message: jasmine.stringMatching(/se cerró en el servidor/), color: 'warning'
    }));
  });
});
