use prost::Message;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    prost_build::compile_protos(&["proto/wallet-activity.proto"], &["proto"])?;
    let descriptors = prost_types::FileDescriptorSet::decode(
        include_bytes!("vendor/transfer-descriptors.bin").as_slice(),
    )?;
    prost_build::Config::new().compile_fds(descriptors)?;
    println!("cargo:rerun-if-changed=proto");
    println!("cargo:rerun-if-changed=vendor/transfer-descriptors.bin");
    Ok(())
}
