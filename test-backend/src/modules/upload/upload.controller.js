import { asyncHandler } from '../../shared/asyncHandler.js';
import { ApiResponse } from '../../shared/apiResponse.js';
import { ApiError } from '../../shared/apiError.js';
import { UploadService } from './upload.service.js';

const uploadService = new UploadService();

export class UploadController {
  requestUploadUrl = asyncHandler(async (req, res) => {
    const { filename, contentType, purpose } = req.body;
    if (!filename || !contentType) {
      throw ApiError.badRequest('filename and contentType are required.');
    }
    const result = await uploadService.requestUploadUrl(filename, contentType, purpose);
    res.status(200).json(new ApiResponse(200, result, 'Upload URL generated successfully.'));
  });

  saveFileRecord = asyncHandler(async (req, res) => {
    const upload = await uploadService.saveFileRecord(req.body);
    res.status(201).json(new ApiResponse(201, upload, 'File record saved successfully.'));
  });

  listFiles = asyncHandler(async (req, res) => {
    const purpose = req.query.purpose;
    const files = await uploadService.listFiles(purpose);
    res.status(200).json(new ApiResponse(200, files, 'Files fetched successfully.'));
  });

  deleteFile = asyncHandler(async (req, res) => {
    const success = await uploadService.deleteFile(req.params.id);
    if (!success) throw ApiError.notFound('File record not found.');
    res.status(200).json(new ApiResponse(200, null, 'File deleted successfully.'));
  });
}
