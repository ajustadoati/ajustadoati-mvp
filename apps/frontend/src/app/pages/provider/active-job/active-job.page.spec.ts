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
      updateActiveJob: jasmine.createSpy(), completeActiveJob: jasmine.createSpy()
    };
    const page = new ActiveJobPage(router as any, {} as any, toast as any, http as any, workspace as any);
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

  it('keeps the job active when the backend rejects completion', async () => {
    const { page, workspace, router } = pageWith(throwError(() => new Error('Network error')));
    spyOn(console, 'error');
    await (page as any).completeJob();
    expect(workspace.completeActiveJob).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(page.activeJob?.status).toBe(JobStatus.ON_SITE);
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
