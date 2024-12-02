// mp4_audio_extractor.cpp

#include <iostream>
#include <fstream>
#include <cstdint>
#include <vector>
#include <string>
#include <ctime>
#include <iomanip>
#include <sstream>
#include <memory>   // For std::unique_ptr
#include <cstring>  // For strncmp

// Define the input MP4 file path
const std::string INPUT_FILE = "C:\\Users\\Scott\\Downloads\\-_.mp4";

// Global variables for codec parameters
int audio_object_type = 0;
int sample_rate_index = 0;
int channel_config = 0;
int channels = 0;
int sample_rate = 0;

// Sample Table Structure
struct SampleTable {
    uint32_t sample_count = 0;
    std::vector<uint32_t> sample_sizes;
    uint32_t chunk_count = 0;
    std::vector<uint64_t> chunk_offsets;
    std::vector<uint32_t> samples_per_chunk;
};

SampleTable sample_table;

// Function to map sample rate index to actual sample rate
int get_sample_rate_from_index(int index) {
    int sample_rates[] = {
        96000, 88200, 64000, 48000, 44100, 32000,
        24000, 22050, 16000, 12000, 11025, 8000,
        7350, 0, 0, 0
    };
    if (index >= 0 && index < 16) {
        return sample_rates[index];
    }
    return 0;
}

// Read functions
uint16_t read_uint16_be(std::ifstream &ifs) {
    uint8_t buffer[2];
    ifs.read(reinterpret_cast<char*>(buffer), 2);
    return (buffer[0] << 8) | buffer[1];
}

uint32_t read_uint32_be(std::ifstream &ifs) {
    uint8_t buffer[4];
    ifs.read(reinterpret_cast<char*>(buffer), 4);
    return (buffer[0] << 24) | (buffer[1] << 16) | (buffer[2] << 8) | buffer[3];
}

uint64_t read_uint64_be(std::ifstream &ifs) {
    uint8_t buffer[8];
    ifs.read(reinterpret_cast<char*>(buffer), 8);
    return ((uint64_t)buffer[0] << 56) | ((uint64_t)buffer[1] << 48) |
           ((uint64_t)buffer[2] << 40) | ((uint64_t)buffer[3] << 32) |
           ((uint64_t)buffer[4] << 24) | ((uint64_t)buffer[5] << 16) |
           ((uint64_t)buffer[6] << 8) | buffer[7];
}

// Function prototypes
void parse_moov(std::ifstream &ifs, uint64_t end_offset);
void parse_trak(std::ifstream &ifs, uint64_t end_offset);
void parse_mdia(std::ifstream &ifs, uint64_t end_offset, bool &is_audio_track);
void parse_minf(std::ifstream &ifs, uint64_t end_offset, bool is_audio_track);
void parse_stbl(std::ifstream &ifs, uint64_t end_offset, bool is_audio_track);
void parse_stsd(std::ifstream &ifs, uint64_t box_end_offset);
void extract_audio_samples(std::ifstream &ifs, uint64_t mdat_offset, uint64_t mdat_size);
void write_adts_header(std::ofstream &ofs, int aac_frame_length, int profile, int sample_rate_index, int channel_config);

// Main function
int main() {
    std::cout << "Opening input file: " << INPUT_FILE << std::endl;
    std::ifstream ifs(INPUT_FILE, std::ios::binary);
    if (!ifs) {
        std::cerr << "Failed to open input file." << std::endl;
        return 1;
    }

    // Get file size
    ifs.seekg(0, std::ios::end);
    uint64_t file_size = ifs.tellg();
    ifs.seekg(0, std::ios::beg);

    uint64_t mdat_offset = 0;
    uint64_t mdat_size = 0;

    std::cout << "Starting MP4 parsing..." << std::endl;
    // Start parsing
    while (ifs.tellg() < static_cast<std::streampos>(file_size)) {
        uint64_t box_start = ifs.tellg();
        uint32_t size = read_uint32_be(ifs);
        char type[5] = {0};
        ifs.read(type, 4);

        uint64_t box_size = size;
        if (size == 1) {
            box_size = read_uint64_be(ifs);
        }

        if (strncmp(type, "moov", 4) == 0) {
            std::cout << "Found 'moov' box at offset " << box_start << std::endl;
            parse_moov(ifs, box_start + box_size);
        } else if (strncmp(type, "mdat", 4) == 0) {
            std::cout << "Found 'mdat' box at offset " << box_start << std::endl;
            mdat_offset = ifs.tellg();
            mdat_size = box_size - 8;
            ifs.seekg(box_size - 8, std::ios::cur);
        } else {
            ifs.seekg(box_start + box_size, std::ios::beg);
        }
    }

    if (mdat_offset == 0 || mdat_size == 0) {
        std::cerr << "'mdat' box not found." << std::endl;
        return 1;
    }

    if (sample_table.sample_count == 0 || sample_table.chunk_count == 0) {
        std::cerr << "Sample table not properly initialized." << std::endl;
        return 1;
    }

    std::cout << "Starting audio extraction..." << std::endl;
    extract_audio_samples(ifs, mdat_offset, mdat_size);
    std::cout << "Audio extraction completed." << std::endl;

    return 0;
}

/* Parse the 'moov' box */
void parse_moov(std::ifstream &ifs, uint64_t end_offset) {
    while (ifs.tellg() < static_cast<std::streampos>(end_offset)) {
        uint64_t box_start = ifs.tellg();
        uint32_t size = read_uint32_be(ifs);
        char type[5] = {0};
        ifs.read(type, 4);

        uint64_t box_size = size;
        if (size == 1) {
            box_size = read_uint64_be(ifs);
        }

        if (strncmp(type, "trak", 4) == 0) {
            parse_trak(ifs, box_start + box_size);
        } else {
            ifs.seekg(box_start + box_size, std::ios::beg);
        }
    }
}

/* Parse the 'trak' box */
void parse_trak(std::ifstream &ifs, uint64_t end_offset) {
    bool is_audio_track = false;
    while (ifs.tellg() < static_cast<std::streampos>(end_offset)) {
        uint64_t box_start = ifs.tellg();
        uint32_t size = read_uint32_be(ifs);
        char type[5] = {0};
        ifs.read(type, 4);

        uint64_t box_size = size;
        if (size == 1) {
            box_size = read_uint64_be(ifs);
        }

        if (strncmp(type, "mdia", 4) == 0) {
            parse_mdia(ifs, box_start + box_size, is_audio_track);
        } else {
            ifs.seekg(box_start + box_size, std::ios::beg);
        }
    }
}

/* Parse the 'mdia' box */
void parse_mdia(std::ifstream &ifs, uint64_t end_offset, bool &is_audio_track) {
    while (ifs.tellg() < static_cast<std::streampos>(end_offset)) {
        uint64_t box_start = ifs.tellg();
        uint32_t size = read_uint32_be(ifs);
        char type[5] = {0};
        ifs.read(type, 4);

        uint64_t box_size = size;
        if (size == 1) {
            box_size = read_uint64_be(ifs);
        }

        if (strncmp(type, "hdlr", 4) == 0) {
            ifs.seekg(8, std::ios::cur);
            char handler_type[5] = {0};
            ifs.read(handler_type, 4);
            if (strncmp(handler_type, "soun", 4) == 0) {
                is_audio_track = true;
                std::cout << "Found audio track." << std::endl;
            }
            ifs.seekg(box_start + box_size, std::ios::beg);
        } else if (strncmp(type, "minf", 4) == 0) {
            parse_minf(ifs, box_start + box_size, is_audio_track);
        } else {
            ifs.seekg(box_start + box_size, std::ios::beg);
        }
    }
}

/* Parse the 'minf' box */
void parse_minf(std::ifstream &ifs, uint64_t end_offset, bool is_audio_track) {
    while (ifs.tellg() < static_cast<std::streampos>(end_offset)) {
        uint64_t box_start = ifs.tellg();
        uint32_t size = read_uint32_be(ifs);
        char type[5] = {0};
        ifs.read(type, 4);

        uint64_t box_size = size;
        if (size == 1) {
            box_size = read_uint64_be(ifs);
        }

        if (strncmp(type, "stbl", 4) == 0) {
            parse_stbl(ifs, box_start + box_size, is_audio_track);
        } else {
            ifs.seekg(box_start + box_size, std::ios::beg);
        }
    }
}

/* Parse the 'stbl' box */
void parse_stbl(std::ifstream &ifs, uint64_t end_offset, bool is_audio_track) {
    if (!is_audio_track) {
        ifs.seekg(end_offset, std::ios::beg);
        return;
    }

    // Temporary storage for 'stsc' entries
    std::vector<uint32_t> stsc_first_chunks;
    std::vector<uint32_t> stsc_samples_per_chunk;

    while (ifs.tellg() < static_cast<std::streampos>(end_offset)) {
        uint64_t box_start = ifs.tellg();
        uint32_t size = read_uint32_be(ifs);
        char type[5] = {0};
        ifs.read(type, 4);

        uint64_t box_size = size;
        if (size == 1) {
            box_size = read_uint64_be(ifs);
        }

        if (strncmp(type, "stsd", 4) == 0) {
            parse_stsd(ifs, box_start + box_size);
        } else if (strncmp(type, "stsz", 4) == 0 || strncmp(type, "stz2", 4) == 0) {
            ifs.seekg(4, std::ios::cur);
            uint32_t sample_size = read_uint32_be(ifs);
            sample_table.sample_count = read_uint32_be(ifs);

            if (sample_table.sample_count == 0) {
                std::cerr << "No samples found in 'stsz' box." << std::endl;
                exit(1);
            }

            if (sample_size == 0) {
                sample_table.sample_sizes.resize(sample_table.sample_count);
                for (uint32_t i = 0; i < sample_table.sample_count; i++) {
                    sample_table.sample_sizes[i] = read_uint32_be(ifs);
                }
            } else {
                sample_table.sample_sizes.assign(sample_table.sample_count, sample_size);
            }
            std::cout << "Parsed 'stsz' box with " << sample_table.sample_count << " samples." << std::endl;
            ifs.seekg(box_start + box_size, std::ios::beg);
        } else if (strncmp(type, "stco", 4) == 0 || strncmp(type, "co64", 4) == 0) {
            bool is_co64 = strncmp(type, "co64", 4) == 0;
            ifs.seekg(4, std::ios::cur);
            sample_table.chunk_count = read_uint32_be(ifs);

            if (sample_table.chunk_count == 0) {
                std::cerr << "No chunks found in 'stco' or 'co64' box." << std::endl;
                exit(1);
            }

            sample_table.chunk_offsets.resize(sample_table.chunk_count);
            for (uint32_t i = 0; i < sample_table.chunk_count; i++) {
                if (is_co64) {
                    sample_table.chunk_offsets[i] = read_uint64_be(ifs);
                } else {
                    sample_table.chunk_offsets[i] = read_uint32_be(ifs);
                }
            }
            std::cout << "Parsed '" << type << "' box with " << sample_table.chunk_count << " chunks." << std::endl;
            ifs.seekg(box_start + box_size, std::ios::beg);
        } else if (strncmp(type, "stsc", 4) == 0) {
            ifs.seekg(4, std::ios::cur);
            uint32_t entry_count = read_uint32_be(ifs);

            for (uint32_t i = 0; i < entry_count; i++) {
                uint32_t first_chunk = read_uint32_be(ifs);
                uint32_t samples_per_chunk_entry = read_uint32_be(ifs);
                ifs.seekg(4, std::ios::cur); // Skip sample_desc_index

                stsc_first_chunks.push_back(first_chunk);
                stsc_samples_per_chunk.push_back(samples_per_chunk_entry);
            }
            std::cout << "Parsed 'stsc' box." << std::endl;
            ifs.seekg(box_start + box_size, std::ios::beg);
        } else {
            ifs.seekg(box_start + box_size, std::ios::beg);
        }
    }

    // After all boxes are parsed, populate samples_per_chunk
    if (sample_table.chunk_count == 0 || sample_table.sample_count == 0) {
        std::cerr << "Sample table not fully populated." << std::endl;
        exit(1);
    }

    if (stsc_first_chunks.empty()) {
        std::cerr << "'stsc' box entries not found." << std::endl;
        exit(1);
    }

    sample_table.samples_per_chunk.assign(sample_table.chunk_count, 0);

    for (size_t i = 0; i < stsc_first_chunks.size(); ++i) {
        uint32_t start_chunk = stsc_first_chunks[i] - 1;
        uint32_t end_chunk = (i + 1 < stsc_first_chunks.size()) ? stsc_first_chunks[i + 1] - 1 : sample_table.chunk_count;
        uint32_t samples_in_chunk = stsc_samples_per_chunk[i];

        for (uint32_t j = start_chunk; j < end_chunk && j < sample_table.chunk_count; ++j) {
            sample_table.samples_per_chunk[j] = samples_in_chunk;
        }
    }

    // Optional: Check if any samples_per_chunk is zero
    for (size_t j = 0; j < sample_table.samples_per_chunk.size(); ++j) {
        if (sample_table.samples_per_chunk[j] == 0) {
            std::cerr << "Chunk " << j + 1 << " has zero samples per chunk." << std::endl;
            exit(1);
        }
    }
}

/* Parse the 'stsd' box to extract codec parameters */
void parse_stsd(std::ifstream &ifs, uint64_t box_end_offset) {
    ifs.seekg(4, std::ios::cur); // Skip version and flags
    uint32_t entry_count = read_uint32_be(ifs);

    for (uint32_t i = 0; i < entry_count; i++) {
        uint64_t entry_start = ifs.tellg();
        uint32_t size = read_uint32_be(ifs);
        char format[5] = {0};
        ifs.read(format, 4);

        uint64_t entry_size = size;
        if (size == 1) {
            entry_size = read_uint64_be(ifs);
        }

        if (strncmp(format, "mp4a", 4) == 0) {
            ifs.seekg(6, std::ios::cur); // Skip reserved
            read_uint16_be(ifs); // data_reference_index

            ifs.seekg(8, std::ios::cur); // Skip version, revision, vendor

            channels = read_uint16_be(ifs);
            read_uint16_be(ifs); // sample_size
            ifs.seekg(4, std::ios::cur); // Skip compression_id and packet_size
            sample_rate = read_uint32_be(ifs) >> 16;

            /* Parse 'esds' box */
            while (ifs.tellg() < static_cast<std::streampos>(entry_start + entry_size)) {
                uint32_t box_size = read_uint32_be(ifs);
                char box_type[5] = {0};
                ifs.read(box_type, 4);

                if (strncmp(box_type, "esds", 4) == 0) {
                    ifs.seekg(4, std::ios::cur); // Skip version and flags

                    /* Parse ES Descriptor */
                    uint8_t tag = ifs.get(); // ES_DescrTag (0x03)
                    uint32_t length = 0;
                    uint8_t byte = 0;
                    do {
                        byte = ifs.get();
                        length = (length << 7) | (byte & 0x7F);
                    } while (byte & 0x80);

                    ifs.seekg(2, std::ios::cur); // Skip ES_ID
                    uint8_t flags = ifs.get();

                    if (flags & 0x80) ifs.seekg(2, std::ios::cur); // dependsOn_ES_ID
                    if (flags & 0x40) {
                        uint8_t url_length = ifs.get();
                        ifs.seekg(url_length, std::ios::cur); // URL
                    }
                    if (flags & 0x20) ifs.seekg(2, std::ios::cur); // OCR_ES_ID

                    tag = ifs.get(); // DecoderConfigDescrTag (0x04)
                    length = 0;
                    do {
                        byte = ifs.get();
                        length = (length << 7) | (byte & 0x7F);
                    } while (byte & 0x80);

                    ifs.get(); // objectTypeIndication
                    ifs.get(); // streamType
                    ifs.seekg(3, std::ios::cur); // bufferSizeDB
                    ifs.seekg(4, std::ios::cur); // maxBitrate
                    ifs.seekg(4, std::ios::cur); // avgBitrate

                    tag = ifs.get(); // DecoderSpecificInfoTag (0x05)
                    length = 0;
                    do {
                        byte = ifs.get();
                        length = (length << 7) | (byte & 0x7F);
                    } while (byte & 0x80);

                    // Use smart pointers for automatic memory management
                    std::unique_ptr<uint8_t[]> audio_specific_config(new uint8_t[length]);
                    ifs.read(reinterpret_cast<char*>(audio_specific_config.get()), length);

                    if (length >= 2) {
                        audio_object_type = (audio_specific_config[0] & 0xF8) >> 3;
                        sample_rate_index = ((audio_specific_config[0] & 0x07) << 1) | ((audio_specific_config[1] & 0x80) >> 7);
                        channel_config = (audio_specific_config[1] & 0x78) >> 3;
                    }

                    std::cout << "Parsed 'esds' box. Audio Object Type: " << audio_object_type
                              << ", Sample Rate Index: " << sample_rate_index
                              << ", Channel Config: " << channel_config << std::endl;
                    break;
                } else {
                    ifs.seekg(box_size - 8, std::ios::cur);
                }
            }
            ifs.seekg(entry_start + entry_size, std::ios::beg);
        } else {
            ifs.seekg(entry_start + entry_size, std::ios::beg);
        }
    }
}

/* Write ADTS header to the output file */
void write_adts_header(std::ofstream &ofs, int aac_frame_length, int profile, int sample_rate_index, int channel_config) {
    uint8_t adts_header[7];

    int adts_length = aac_frame_length + 7; // AAC frame length + ADTS header length

    adts_header[0] = 0xFF; // Sync word
    adts_header[1] = 0xF1; // Sync word (continued) + MPEG-2 Layer
    adts_header[2] = ((profile - 1) << 6) | (sample_rate_index << 2) | (channel_config >> 2);
    adts_header[3] = ((channel_config & 3) << 6) | ((adts_length >> 11) & 0x03);
    adts_header[4] = (adts_length >> 3) & 0xFF;
    adts_header[5] = ((adts_length & 7) << 5) | 0x1F;
    adts_header[6] = 0xFC;

    ofs.write(reinterpret_cast<char*>(adts_header), 7);
}

/* Extract audio samples and write to output file */
void extract_audio_samples(std::ifstream &ifs, uint64_t mdat_offset, uint64_t mdat_size) {
    // Generate output filename with timestamp
    std::time_t raw_time = std::time(nullptr);
    std::tm *time_info = std::localtime(&raw_time);
    std::ostringstream time_stream;
    time_stream << std::put_time(time_info, "%Y%m%d_%H%M%S");
    std::string time_string = time_stream.str();

    std::string output_filename = "extracted_audio_" + time_string + ".aac";

    std::cout << "Writing extracted audio to: " << output_filename << std::endl;
    std::ofstream ofs(output_filename, std::ios::binary);
    if (!ofs) {
        std::cerr << "Failed to open output file." << std::endl;
        return;
    }

    if (audio_object_type == 0 || sample_rate_index == 0 || channel_config == 0) {
        std::cerr << "Audio codec parameters not set properly." << std::endl;
        ofs.close();
        return;
    }

    // Verify the sample rate
    int actual_sample_rate = get_sample_rate_from_index(sample_rate_index);
    if (actual_sample_rate != sample_rate) {
        std::cerr << "Sample rate mismatch: Parsed sample rate index corresponds to " << actual_sample_rate
                  << " Hz, but sample rate is " << sample_rate << " Hz." << std::endl;
        // Optionally, correct the sample_rate if necessary
    }

    uint32_t sample_index = 0;
    uint32_t total_samples = sample_table.sample_count;
    uint32_t total_chunks = sample_table.chunk_count;
    const std::vector<uint32_t> &sample_sizes = sample_table.sample_sizes;
    const std::vector<uint64_t> &chunk_offsets = sample_table.chunk_offsets;
    const std::vector<uint32_t> &samples_per_chunk = sample_table.samples_per_chunk;

    uint32_t current_chunk = 0;
    uint64_t offset = 0;

    for (current_chunk = 0; current_chunk < total_chunks; current_chunk++) {
        offset = chunk_offsets[current_chunk];
        if (current_chunk >= samples_per_chunk.size()) {
            std::cerr << "Mismatch in chunk and samples_per_chunk sizes." << std::endl;
            break; // Or handle error appropriately
        }
        uint32_t samples_in_chunk = samples_per_chunk[current_chunk];

        for (uint32_t i = 0; i < samples_in_chunk; i++) {
            if (sample_index >= total_samples) {
                break;
            }

            uint32_t size = sample_sizes[sample_index];

            if (offset < mdat_offset || (offset + size) > (mdat_offset + mdat_size)) {
                std::cerr << "Invalid sample offset or size" << std::endl;
                ofs.close();
                return;
            }

            ifs.seekg(offset, std::ios::beg);
            std::vector<uint8_t> buffer(size);
            ifs.read(reinterpret_cast<char*>(buffer.data()), size);
            if (ifs.gcount() != static_cast<std::streamsize>(size)) {
                std::cerr << "Failed to read sample data" << std::endl;
                ofs.close();
                return;
            }

            write_adts_header(ofs, size, audio_object_type, sample_rate_index, channel_config);

            ofs.write(reinterpret_cast<char*>(buffer.data()), size);

            offset += size;
            sample_index++;

            /* Optional: Print progress every 1000 samples */
            if (sample_index % 1000 == 0) {
                std::cout << "Extracted " << sample_index << " samples..." << std::endl;
            }
        }
    }

    ofs.close();
    std::cout << "Extraction completed. Total samples extracted: " << sample_index << std::endl;
}
