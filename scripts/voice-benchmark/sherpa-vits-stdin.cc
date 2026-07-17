#include <algorithm>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>

#include "sherpa-onnx/c-api/cxx-api.h"

namespace {

void WriteU16(std::ofstream &output, uint16_t value) {
  output.put(static_cast<char>(value & 0xff));
  output.put(static_cast<char>((value >> 8) & 0xff));
}

void WriteU32(std::ofstream &output, uint32_t value) {
  WriteU16(output, static_cast<uint16_t>(value & 0xffff));
  WriteU16(output, static_cast<uint16_t>((value >> 16) & 0xffff));
}

void WriteWav(const std::string &path,
              const sherpa_onnx::cxx::GeneratedAudio &audio) {
  const uint32_t data_size = static_cast<uint32_t>(audio.samples.size() * 2);
  std::ofstream output(path, std::ios::binary | std::ios::trunc);
  if (!output) throw std::runtime_error("could not open WAV output");
  output.write("RIFF", 4);
  WriteU32(output, 36 + data_size);
  output.write("WAVEfmt ", 8);
  WriteU32(output, 16);
  WriteU16(output, 1);
  WriteU16(output, 1);
  WriteU32(output, static_cast<uint32_t>(audio.sample_rate));
  WriteU32(output, static_cast<uint32_t>(audio.sample_rate * 2));
  WriteU16(output, 2);
  WriteU16(output, 16);
  output.write("data", 4);
  WriteU32(output, data_size);
  for (float sample : audio.samples) {
    const float clipped = std::max(-1.0f, std::min(1.0f, sample));
    WriteU16(output, static_cast<uint16_t>(
                         static_cast<int16_t>(clipped * 32767.0f)));
  }
  if (!output) throw std::runtime_error("could not write WAV output");
}

}  // namespace

int main(int argc, char **argv) {
  if (argc != 5) {
    std::cerr << "usage: sherpa-vits-stdin MODEL TOKENS DATA_DIR OUTPUT\n";
    return 2;
  }
  try {
    const std::string text{std::istreambuf_iterator<char>(std::cin), {}};
    if (text.find_first_not_of(" \t\r\n") == std::string::npos) {
      throw std::runtime_error("stdin text must be nonempty");
    }
    sherpa_onnx::cxx::OfflineTtsConfig config;
    config.model.vits.model = argv[1];
    config.model.vits.tokens = argv[2];
    config.model.vits.data_dir = argv[3];
    config.model.num_threads = 2;
    const auto tts = sherpa_onnx::cxx::OfflineTts::Create(config);
    WriteWav(argv[4], tts.Generate(text));
    return 0;
  } catch (const std::exception &error) {
    std::cerr << "sherpa VITS driver failed: " << error.what() << '\n';
    return 1;
  }
}
