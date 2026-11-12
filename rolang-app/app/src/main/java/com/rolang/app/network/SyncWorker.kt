package com.rolang.app.network

import android.content.Context
import androidx.work.*
import kotlinx.coroutines.CancellationException
import java.util.concurrent.TimeUnit

class SyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        return try {
            val config = ServerConfig.load(applicationContext)
            if (!config.onlineEnabled) return Result.success()
            val services = AppServices.get(applicationContext)
            val complete = services.synchronize(config.automaticSyncEnabled)
            if (complete) Result.success() else Result.retry()
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: ApiException) {
            if (error.status in setOf(400, 401, 403) || (error.status == 409 && error.code != "CURSOR_INVALID")) Result.failure()
            else Result.retry()
        } catch (_: IllegalArgumentException) { Result.failure() }
        catch (_: AccountMismatch) { Result.failure() }
        catch (_: Exception) { Result.retry() }
    }
}

object SyncScheduler {
    private const val immediate = "rolang-online"
    private const val periodic = "rolang-periodic-sync"
    private val connected = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
    fun configure(context: Context, config: ServerConfig) {
        val manager = WorkManager.getInstance(context)
        if (config.onlineEnabled && config.automaticSyncEnabled) {
            val work = PeriodicWorkRequestBuilder<SyncWorker>(config.syncIntervalMinutes, TimeUnit.MINUTES)
                .setConstraints(connected).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build()
            manager.enqueueUniquePeriodicWork(periodic, ExistingPeriodicWorkPolicy.UPDATE, work)
        } else manager.cancelUniqueWork(periodic)
        if (!config.onlineEnabled) manager.cancelUniqueWork(immediate)
    }
    fun enqueue(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(connected)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build()
        WorkManager.getInstance(context).enqueueUniqueWork(immediate, ExistingWorkPolicy.KEEP, request)
    }
}
