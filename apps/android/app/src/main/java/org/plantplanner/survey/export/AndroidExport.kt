package org.plantplanner.survey.export

import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.io.IOException
import java.io.OutputStream

/** Puts files where the user can find them (Downloads) and sends them out (share sheet). */
object AndroidExport {

    /** Subfolder of Downloads that holds everything this app saves. */
    const val DOWNLOAD_SUBFOLDER = "Plant Survey"

    /**
     * Writes a new file into Downloads/Plant Survey through MediaStore, which needs no storage
     * permission on Android 10 and later. Returns the file's content URI.
     */
    fun saveToDownloads(context: Context, displayName: String, mimeType: String, write: (OutputStream) -> Unit): Uri {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, displayName)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$DOWNLOAD_SUBFOLDER")
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IOException("Could not create $displayName in Downloads")
        try {
            val out = resolver.openOutputStream(uri) ?: throw IOException("Could not write $displayName")
            out.use(write)
            val done = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
            resolver.update(uri, done, null, null)
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        }
        return uri
    }

    /** Writes [displayName] into the share folder and returns it. FileProvider can serve it. */
    fun stageForShare(context: Context, displayName: String, write: (OutputStream) -> Unit): File {
        val dir = File(context.cacheDir, "share").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, displayName)
        file.outputStream().use(write)
        return file
    }

    /** Opens the system share sheet with [file]. The file must be in a folder declared in file_paths.xml. */
    fun share(context: Context, file: File, mimeType: String, title: String) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newRawUri(file.name, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(send, title).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }
}
