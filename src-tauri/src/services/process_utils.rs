use ssh::algorithm::{Enc, Kex, PubKey};

pub const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

pub const SSH_KEX_ALGORITHMS: &[Kex] = &[
    Kex::Curve25519Sha256,
    Kex::EcdhSha2Nistrp256,
    Kex::DiffieHellmanGroup14Sha256,
    Kex::DiffieHellmanGroup14Sha1,
];

pub const SSH_PUBKEY_ALGORITHMS: &[PubKey] = &[
    PubKey::SshEd25519,
    PubKey::RsaSha2_256,
    PubKey::RsaSha2_512,
];

pub const SSH_ENC_ALGORITHMS: &[Enc] = &[
    Enc::Chacha20Poly1305Openssh,
    Enc::Aes256Ctr,
    Enc::Aes192Ctr,
    Enc::Aes128Ctr,
];

pub const SSH_TIMEOUT_SECS: u64 = 30;
pub const SSH_CONNECT_TIMEOUT_SECS: u64 = 10;
