import React, { useState, useEffect, useRef } from 'react';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext';

interface Video {
    id: number;
    title: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    error_message?: string;
    created_at: string;
    file_id?: string;
}

const DashboardPage: React.FC = () => {
    const [videos, setVideos] = useState<Video[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { logout } = useAuth();

    const fetchVideos = async () => {
        try {
            const response = await axiosInstance.get('/videos/list/');
            setVideos(response.data);
        } catch (error) {
            console.error("Failed to fetch videos", error);
        }
    };

    useEffect(() => {
        fetchVideos();
        // Polling every 5 seconds
        const intervalId = setInterval(() => {
             fetchVideos();
        }, 5000);

        return () => clearInterval(intervalId);
    }, []);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0) return;
        
        const file = event.target.files[0];
        const formData = new FormData();
        formData.append('file', file);

        setUploading(true);
        setUploadError(null);

        try {
             await axiosInstance.post('/videos/upload/', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            // Refresh list immediately
            fetchVideos();
             // Clear input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error: any) {
            console.error("Upload failed", error);
            setUploadError(error.response?.data?.error || "Upload failed. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-gray-800">My Videos</h1>
                     <div className="flex gap-4">
                        <button 
                            onClick={logout}
                            className="text-sm text-red-600 hover:text-red-800 font-semibold"
                        >
                            Logout
                        </button>
                    </div>
                </header>
                
                <div className="bg-white p-6 rounded-lg shadow-sm mb-8">
                    <h2 className="text-lg font-semibold text-gray-700 mb-4">Upload New Video</h2>
                    <div className="flex items-center gap-4">
                        <input 
                            type="file" 
                            accept="video/*"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                            disabled={uploading}
                            className="block w-full text-sm text-gray-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-blue-50 file:text-blue-700
                                hover:file:bg-blue-100"
                        />
                         {uploading && <span className="text-blue-600 font-medium">Uploading...</span>}
                    </div>
                    {uploadError && <p className="text-red-500 text-sm mt-2">{uploadError}</p>}
                </div>

                <div className="grid gap-6">
                    {videos.map((video) => (
                        <div key={video.id} className="bg-white rounded-xl shadow-md overflow-hidden p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-900">{video.title}</h3>
                                    <p className="text-sm text-gray-500">{new Date(video.created_at).toLocaleString()}</p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium 
                                    ${video.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 
                                      video.status === 'PROCESSING' ? 'bg-blue-100 text-blue-800' :
                                      video.status === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {video.status}
                                </span>
                            </div>

                            {video.status === 'COMPLETED' && video.file_id && (
                                <div className="mt-4 bg-black rounded-lg overflow-hidden aspect-video">
                                    <video 
                                        controls 
                                        preload="metadata"
                                        className="w-full h-full"
                                        src={`http://localhost:8000/api/videos/stream/${video.file_id}/`} 
                                    >
                                        Your browser does not support the video tag.
                                    </video>
                                </div>
                            )}

                            {video.status === 'FAILED' && (
                                <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md">
                                    <p className="font-medium">Processing Error:</p>
                                    <p className="text-sm">{video.error_message}</p>
                                </div>
                            )}
                            
                             {video.status === 'PROCESSING' && (
                                <div className="mt-4 p-8 flex justify-center bg-gray-50 rounded-md">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    <span className="ml-3 text-gray-600">Processing video...</span>
                                </div>
                            )}
                        </div>
                    ))}
                    
                    {videos.length === 0 && !uploading && (
                         <div className="text-center py-12 text-gray-500 bg-white rounded-lg shadow">
                             No videos uploaded yet.
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;
